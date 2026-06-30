"""Local audio capture has moved to the desktop client (Tauri/Rust).

This module used to capture audio from the backend host's own OS devices:
``AudioCapture`` (microphone via ``sounddevice``), ``SystemAudioCapture``
(Windows WASAPI loopback via ``soundcard``), and ``MixedAudioCapture`` (both
mixed). That design only works when the backend runs on the user's machine.

Now that the backend is deployed to the cloud (Railway, headless Linux with no
audio devices), capture happens in the Tauri/Rust shell and 16 kHz mono int16
PCM frames are streamed over the WebSocket. ``AudioStreamingService.feed_audio``
forwards each frame to Deepgram. The ``sounddevice``/``soundcard`` dependencies
(and their native PortAudio/WASAPI requirements) have been removed so this
package imports cleanly on Linux.

Kept as a placeholder to document the change; intentionally has no runtime code.
"""
