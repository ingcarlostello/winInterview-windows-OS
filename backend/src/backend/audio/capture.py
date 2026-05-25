import pyaudio
import webrtcvad


class AudioCapture:
    def __init__(self):
        self.vad = webrtcvad.Vad()
        self.audio = pyaudio.PyAudio()

    async def start(self):
        pass

    async def stop(self):
        pass
