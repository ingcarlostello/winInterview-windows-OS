//! Client-side audio capture for the cloud backend.
//!
//! The Python backend used to capture the user's mic/system audio locally. Now
//! that it runs remotely (Railway), capture lives here in the Tauri shell and
//! 16 kHz mono int16 PCM frames (320 samples / 640 bytes / 20 ms) are streamed
//! to the frontend over a Tauri `Channel`, which forwards them as binary
//! WebSocket frames to `/ws`. The backend hands each frame to Deepgram.
//!
//! Three sources (parity with the old Python pipeline):
//!   - "mic"    : microphone via `cpal` (all plans)
//!   - "system" : Windows WASAPI loopback via `wasapi` (Ultra) — hears the
//!                interviewer even through headphones
//!   - "both"   : mic + system mixed with int32 anti-clip (Ultra)
//!
//! NOTE: This module uses `cpal` and `wasapi` APIs and has not been compiled in
//! the authoring environment (no Rust toolchain). Expect a `cargo build` pass to
//! reconcile minor crate-version API differences (especially `wasapi`).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{mpsc, Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Duration;

use base64::Engine;
use tauri::ipc::Channel;
use tauri::State;

const TARGET_RATE: u32 = 16_000;
const FRAME_SAMPLES: usize = 320; // 20 ms @ 16 kHz
const FRAME_BYTES: usize = FRAME_SAMPLES * 2; // int16 LE

/// Managed Tauri state holding the active capture session (if any).
#[derive(Default)]
pub struct AudioState(pub Mutex<Option<CaptureSession>>);

pub struct CaptureSession {
    stop: Arc<AtomicBool>,
    threads: Vec<JoinHandle<()>>,
}

impl CaptureSession {
    fn shutdown(self) {
        self.stop.store(true, Ordering::SeqCst);
        for t in self.threads {
            let _ = t.join();
        }
    }
}

// ── Resampling + framing helpers ────────────────────────────────────────────

/// Simple anti-aliased downsampler: averages the input mono f32 samples that
/// fall into each output-sample window (`in_rate / TARGET_RATE` wide). Good
/// enough for speech ASR and dependency-free (avoids pinning a resampler crate).
struct Downsampler {
    ratio: f64, // input samples per output sample (>= 1 for downsampling)
    pos: f64,   // fractional input position of the next output boundary
    acc: f64,   // running sum for the current window
    count: f64, // samples accumulated in the current window
}

impl Downsampler {
    fn new(in_rate: u32) -> Self {
        Self {
            ratio: in_rate as f64 / TARGET_RATE as f64,
            pos: 0.0,
            acc: 0.0,
            count: 0.0,
        }
    }

    /// Feed mono f32 samples; append produced 16 kHz int16 samples to `out`.
    fn process(&mut self, input: &[f32], out: &mut Vec<i16>) {
        for &s in input {
            self.acc += s as f64;
            self.count += 1.0;
            self.pos += 1.0;
            if self.pos >= self.ratio {
                let avg = if self.count > 0.0 { self.acc / self.count } else { 0.0 };
                let clamped = avg.clamp(-1.0, 1.0);
                out.push((clamped * 32767.0) as i16);
                self.pos -= self.ratio;
                self.acc = 0.0;
                self.count = 0.0;
            }
        }
    }
}

/// Accumulates 16 kHz int16 mono samples into fixed 320-sample frames.
struct Framer {
    buf: Vec<i16>,
}

impl Framer {
    fn new() -> Self {
        Self { buf: Vec::with_capacity(FRAME_SAMPLES * 2) }
    }

    /// Push samples; invoke `emit` for every complete 640-byte frame.
    fn push(&mut self, samples: &[i16], mut emit: impl FnMut(Vec<u8>)) {
        self.buf.extend_from_slice(samples);
        while self.buf.len() >= FRAME_SAMPLES {
            let chunk: Vec<i16> = self.buf.drain(..FRAME_SAMPLES).collect();
            let mut bytes = Vec::with_capacity(FRAME_BYTES);
            for s in chunk {
                bytes.extend_from_slice(&s.to_le_bytes());
            }
            emit(bytes);
        }
    }
}

fn mix_frames(a: &[u8], b: &[u8]) -> Vec<u8> {
    let n = a.len().min(b.len());
    let mut out = Vec::with_capacity(n);
    let mut i = 0;
    while i + 1 < n {
        let sa = i16::from_le_bytes([a[i], a[i + 1]]) as i32;
        let sb = i16::from_le_bytes([b[i], b[i + 1]]) as i32;
        let m = (sa + sb).clamp(-32768, 32767) as i16;
        out.extend_from_slice(&m.to_le_bytes());
        i += 2;
    }
    out
}

// ── Microphone capture (cpal) ───────────────────────────────────────────────

/// Spawns a thread that captures the default mic and pushes 640-byte frames to
/// `frame_tx`. The cpal stream is created and dropped on this thread (it is
/// `!Send` on Windows). The realtime data callback only downmixes + forwards
/// raw mono f32 to a worker channel; resampling/framing happen off the callback.
fn spawn_mic(stop: Arc<AtomicBool>, frame_tx: mpsc::Sender<Vec<u8>>) -> JoinHandle<()> {
    std::thread::spawn(move || {
        use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};

        let host = cpal::default_host();
        let device = match host.default_input_device() {
            Some(d) => d,
            None => {
                log::error!("audio: no default input device");
                return;
            }
        };
        let default_cfg = match device.default_input_config() {
            Ok(c) => c,
            Err(e) => {
                log::error!("audio: default_input_config failed: {e}");
                return;
            }
        };
        let in_rate = default_cfg.sample_rate().0;
        let channels = default_cfg.channels() as usize;
        let sample_format = default_cfg.sample_format();
        let config: cpal::StreamConfig = default_cfg.into();

        // Raw mono f32 samples flow callback → worker via this channel.
        let (mono_tx, mono_rx) = mpsc::channel::<Vec<f32>>();
        let err_fn = |e| log::error!("audio: cpal stream error: {e}");

        let build = || -> Result<cpal::Stream, cpal::BuildStreamError> {
            match sample_format {
                cpal::SampleFormat::F32 => {
                    let tx = mono_tx.clone();
                    device.build_input_stream(
                        &config,
                        move |data: &[f32], _: &_| {
                            let _ = tx.send(downmix_f32(data, channels));
                        },
                        err_fn,
                        None,
                    )
                }
                cpal::SampleFormat::I16 => {
                    let tx = mono_tx.clone();
                    device.build_input_stream(
                        &config,
                        move |data: &[i16], _: &_| {
                            let f: Vec<f32> = data.iter().map(|&s| s as f32 / 32768.0).collect();
                            let _ = tx.send(downmix_f32(&f, channels));
                        },
                        err_fn,
                        None,
                    )
                }
                cpal::SampleFormat::U16 => {
                    let tx = mono_tx.clone();
                    device.build_input_stream(
                        &config,
                        move |data: &[u16], _: &_| {
                            let f: Vec<f32> =
                                data.iter().map(|&s| (s as f32 - 32768.0) / 32768.0).collect();
                            let _ = tx.send(downmix_f32(&f, channels));
                        },
                        err_fn,
                        None,
                    )
                }
                other => {
                    log::error!("audio: unsupported mic sample format {other:?}");
                    return Err(cpal::BuildStreamError::StreamConfigNotSupported);
                }
            }
        };

        let stream = match build() {
            Ok(s) => s,
            Err(e) => {
                log::error!("audio: build_input_stream failed: {e}");
                return;
            }
        };
        if let Err(e) = stream.play() {
            log::error!("audio: stream.play failed: {e}");
            return;
        }
        log::info!("audio: mic capture started ({in_rate} Hz, {channels} ch)");

        let mut down = Downsampler::new(in_rate);
        let mut framer = Framer::new();
        while !stop.load(Ordering::SeqCst) {
            match mono_rx.recv_timeout(Duration::from_millis(100)) {
                Ok(mono) => {
                    let mut out = Vec::new();
                    down.process(&mono, &mut out);
                    framer.push(&out, |frame| {
                        let _ = frame_tx.send(frame);
                    });
                }
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
        drop(stream);
        log::info!("audio: mic capture stopped");
    })
}

fn downmix_f32(interleaved: &[f32], channels: usize) -> Vec<f32> {
    if channels <= 1 {
        return interleaved.to_vec();
    }
    interleaved
        .chunks(channels)
        .map(|frame| frame.iter().copied().sum::<f32>() / channels as f32)
        .collect()
}

// ── System audio loopback (WASAPI, Windows-only) ────────────────────────────

#[cfg(target_os = "windows")]
fn spawn_system(stop: Arc<AtomicBool>, frame_tx: mpsc::Sender<Vec<u8>>) -> JoinHandle<()> {
    std::thread::spawn(move || {
        if let Err(e) = run_loopback(&stop, &frame_tx) {
            log::error!("audio: system loopback error: {e}");
        }
    })
}

#[cfg(target_os = "windows")]
fn run_loopback(
    stop: &Arc<AtomicBool>,
    frame_tx: &mpsc::Sender<Vec<u8>>,
) -> Result<(), Box<dyn std::error::Error>> {
    use wasapi::{get_default_device, initialize_mta, Direction, ShareMode};

    let _ = initialize_mta().ok();
    // Capture the *render* (output) endpoint's stream → that is loopback.
    let device = get_default_device(&Direction::Render)?;
    let mut audio_client = device.get_iaudioclient()?;
    let format = audio_client.get_mixformat()?;
    let in_rate = format.get_samplespersec();
    let channels = format.get_nchannels() as usize;
    let block_align = format.get_blockalign() as usize;
    let sample_type = format.get_subformat()?; // Float or Int

    let (_def_time, min_time) = audio_client.get_periods()?;
    // Loopback requires shared mode + Capture direction on the render device.
    audio_client.initialize_client(
        &format,
        min_time,
        &Direction::Capture,
        &ShareMode::Shared,
        true, // loopback
    )?;
    let h_event = audio_client.set_get_eventhandle()?;
    let capture_client = audio_client.get_audiocaptureclient()?;
    audio_client.start_stream()?;
    log::info!("audio: system loopback started ({in_rate} Hz, {channels} ch)");

    let mut down = Downsampler::new(in_rate);
    let mut framer = Framer::new();
    let mut queue: std::collections::VecDeque<u8> = std::collections::VecDeque::new();

    while !stop.load(Ordering::SeqCst) {
        capture_client.read_from_device_to_deque(&mut queue)?;
        // Drain whole frames (block_align bytes = one sample across all channels).
        let mut mono: Vec<f32> = Vec::new();
        while queue.len() >= block_align {
            let mut frame_bytes = Vec::with_capacity(block_align);
            for _ in 0..block_align {
                frame_bytes.push(queue.pop_front().unwrap());
            }
            mono.push(decode_sample_to_mono(&frame_bytes, channels, &sample_type));
        }
        if !mono.is_empty() {
            let mut out = Vec::new();
            down.process(&mono, &mut out);
            framer.push(&out, |frame| {
                let _ = frame_tx.send(frame);
            });
        }
        if h_event.wait_for_event(200).is_err() {
            // Timeout (e.g. nothing playing) — keep looping; mixer pads silence.
            continue;
        }
    }
    audio_client.stop_stream()?;
    log::info!("audio: system loopback stopped");
    Ok(())
}

#[cfg(target_os = "windows")]
fn decode_sample_to_mono(bytes: &[u8], channels: usize, sample_type: &wasapi::SampleType) -> f32 {
    use wasapi::SampleType;
    let bytes_per_sample = bytes.len() / channels.max(1);
    let mut sum = 0.0f32;
    for ch in 0..channels {
        let off = ch * bytes_per_sample;
        let s = match sample_type {
            SampleType::Float => {
                let arr = [bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]];
                f32::from_le_bytes(arr)
            }
            SampleType::Int => match bytes_per_sample {
                2 => i16::from_le_bytes([bytes[off], bytes[off + 1]]) as f32 / 32768.0,
                4 => i32::from_le_bytes([bytes[off], bytes[off + 1], bytes[off + 2], bytes[off + 3]])
                    as f32
                    / 2_147_483_648.0,
                _ => 0.0,
            },
        };
        sum += s;
    }
    sum / channels.max(1) as f32
}

#[cfg(not(target_os = "windows"))]
fn spawn_system(_stop: Arc<AtomicBool>, _frame_tx: mpsc::Sender<Vec<u8>>) -> JoinHandle<()> {
    std::thread::spawn(|| log::warn!("audio: system loopback unsupported on this OS"))
}

// ── Forwarder: frames → base64 → Channel<String> ────────────────────────────

fn spawn_forwarder(
    stop: Arc<AtomicBool>,
    frame_rx: mpsc::Receiver<Vec<u8>>,
    on_frame: Channel<String>,
) -> JoinHandle<()> {
    std::thread::spawn(move || {
        while !stop.load(Ordering::SeqCst) {
            match frame_rx.recv_timeout(Duration::from_millis(100)) {
                Ok(frame) => {
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&frame);
                    if on_frame.send(b64).is_err() {
                        break;
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    })
}

/// Mixer for "both": pulls mic-anchored frames, mixes the latest system frame
/// (or silence) and forwards the result base64-encoded.
fn spawn_mixer_forwarder(
    stop: Arc<AtomicBool>,
    mic_rx: mpsc::Receiver<Vec<u8>>,
    sys_rx: mpsc::Receiver<Vec<u8>>,
    on_frame: Channel<String>,
) -> JoinHandle<()> {
    std::thread::spawn(move || {
        let silence = vec![0u8; FRAME_BYTES];
        let mut latest_sys = silence.clone();
        while !stop.load(Ordering::SeqCst) {
            // Drain any pending system frames, keep the most recent.
            while let Ok(f) = sys_rx.try_recv() {
                latest_sys = f;
            }
            match mic_rx.recv_timeout(Duration::from_millis(100)) {
                Ok(mic_frame) => {
                    let mixed = mix_frames(&mic_frame, &latest_sys);
                    let b64 = base64::engine::general_purpose::STANDARD.encode(&mixed);
                    if on_frame.send(b64).is_err() {
                        break;
                    }
                }
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(mpsc::RecvTimeoutError::Disconnected) => break,
            }
        }
    })
}

// ── Tauri commands ──────────────────────────────────────────────────────────

/// Start capturing audio for the given source ("mic" | "system" | "both") and
/// stream base64 16 kHz mono int16 PCM frames over `on_frame`. Idempotent:
/// stops any prior session first.
#[tauri::command]
pub fn start_audio(
    source: String,
    on_frame: Channel<String>,
    state: State<'_, AudioState>,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(prev) = guard.take() {
        prev.shutdown();
    }

    let stop = Arc::new(AtomicBool::new(false));
    let mut threads: Vec<JoinHandle<()>> = Vec::new();

    match source.as_str() {
        "both" => {
            let (mic_tx, mic_rx) = mpsc::channel::<Vec<u8>>();
            let (sys_tx, sys_rx) = mpsc::channel::<Vec<u8>>();
            threads.push(spawn_mic(stop.clone(), mic_tx));
            threads.push(spawn_system(stop.clone(), sys_tx));
            threads.push(spawn_mixer_forwarder(stop.clone(), mic_rx, sys_rx, on_frame));
        }
        "system" => {
            let (tx, rx) = mpsc::channel::<Vec<u8>>();
            threads.push(spawn_system(stop.clone(), tx));
            threads.push(spawn_forwarder(stop.clone(), rx, on_frame));
        }
        _ => {
            // default "mic"
            let (tx, rx) = mpsc::channel::<Vec<u8>>();
            threads.push(spawn_mic(stop.clone(), tx));
            threads.push(spawn_forwarder(stop.clone(), rx, on_frame));
        }
    }

    *guard = Some(CaptureSession { stop, threads });
    log::info!("audio: capture session started (source={source})");
    Ok(())
}

/// Stop the active capture session (no-op if none).
#[tauri::command]
pub fn stop_audio(state: State<'_, AudioState>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(session) = guard.take() {
        session.shutdown();
        log::info!("audio: capture session stopped");
    }
    Ok(())
}
