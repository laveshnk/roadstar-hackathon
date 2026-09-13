from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import io
import soundfile as sf
# Using Kokoro-82M or Piper via ONNX
from kokoro import KPipeline

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

pipeline = KPipeline(lang_code='a') # American English

class TTSRequest(BaseModel):
    text: str
    voice: str = "af_heart" # Clear natural dispatcher voice

@app.post("/synthesize")
def synthesize(req: TTSRequest):
    generator = pipeline(req.text, voice=req.voice, speed=1.0, split_pattern=r'\n+')
    for _, _, audio in generator:
        buffer = io.BytesIO()
        sf.write(buffer, audio, 24000, format='WAV')
        buffer.seek(0)
        return Response(content=buffer.read(), media_type="audio/wav")