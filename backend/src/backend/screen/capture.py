import subprocess
import tempfile
import os
import logging

logger = logging.getLogger(__name__)


class ScreenCapture:
    """Captura de pantalla bajo demanda. Captura la ventana activa de cualquier app."""

    EXCLUDED_APPS = {"interview-responder"}

    def capture_screen(self) -> bytes:
        """Captura la ventana activa (excluyendo la app propia) y devuelve PNG bytes."""
        window_id = self._get_active_window_id()
        if window_id:
            return self._capture_window(window_id)
        logger.warning("No active window found, falling back to full screen")
        return self._capture_full_screen()

    def _get_active_window_id(self) -> int | None:
        """Obtiene el ID de la ventana frontal de la app activa via AppleScript."""
        script = """
        tell application "System Events"
            set frontApp to first application process whose frontmost is true
            set appName to name of frontApp
            if appName is not "interview-responder" then
                tell frontApp
                    if exists window 1 then
                        return id of window 1
                    end if
                end tell
            end if
        end tell
        """
        try:
            result = subprocess.run(
                ["osascript", "-e", script],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0 and result.stdout.strip():
                return int(result.stdout.strip())
        except Exception as e:
            logger.warning(f"AppleScript failed: {e}")
        return None

    def _capture_window(self, window_id: int) -> bytes:
        """Captura una ventana especifica por ID sin bordes."""
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            subprocess.run(
                ["screencapture", "-l", str(window_id), "-x", tmp_path],
                check=True,
                timeout=10,
            )
            with open(tmp_path, "rb") as f:
                return f.read()
        finally:
            os.unlink(tmp_path)

    def _capture_full_screen(self) -> bytes:
        """Fallback: captura pantalla completa con screencapture."""
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
            tmp_path = tmp.name
        try:
            subprocess.run(
                ["screencapture", "-x", tmp_path],
                check=True,
                timeout=10,
            )
            with open(tmp_path, "rb") as f:
                return f.read()
        finally:
            os.unlink(tmp_path)
