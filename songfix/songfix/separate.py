"""Vocal / instrumental separation using UVR MDX-Net ONNX models.

The models are downloaded once from the public UVR model repository on GitHub
and cached in ~/.cache/songfix/models.
"""
import os
import urllib.request

import numpy as np

MODEL_URL = "https://github.com/TRvlvr/model_repo/releases/download/all_public_uvr_models/{}"
MODELS = {
    # name: (n_fft, dim_f, dim_t, compensate)
    "UVR-MDX-NET-Voc_FT.onnx": (7680, 3072, 256, 1.021),
    "Kim_Vocal_2.onnx": (7680, 3072, 256, 1.009),
}
HOP = 1024
CACHE_DIR = os.path.join(os.path.expanduser("~"), ".cache", "songfix", "models")


def _model_path(name, log=print):
    os.makedirs(CACHE_DIR, exist_ok=True)
    path = os.path.join(CACHE_DIR, name)
    if not os.path.exists(path):
        log(f"  downloading separation model {name} (~65 MB, first run only)...")
        tmp = path + ".part"
        urllib.request.urlretrieve(MODEL_URL.format(name), tmp)
        os.replace(tmp, path)
    return path


def _stft(x, n_fft, hop, window):
    # Matches torch.stft(center=True, pad_mode="reflect", onesided=True).
    pad = n_fft // 2
    x = np.pad(x, ((0, 0), (pad, pad)), mode="reflect")
    n_frames = 1 + (x.shape[-1] - n_fft) // hop
    idx = np.arange(n_fft)[None, :] + hop * np.arange(n_frames)[:, None]
    frames = x[:, idx] * window  # (ch, T, n_fft)
    return np.fft.rfft(frames, axis=-1).transpose(0, 2, 1)  # (ch, F, T)


def _istft(spec, n_fft, hop, window, length):
    frames = np.fft.irfft(spec.transpose(0, 2, 1), n=n_fft, axis=-1) * window
    ch, n_frames, _ = frames.shape
    out_len = n_fft + hop * (n_frames - 1)
    out = np.zeros((ch, out_len))
    norm = np.zeros(out_len)
    for t in range(n_frames):
        out[:, t * hop:t * hop + n_fft] += frames[:, t]
        norm[t * hop:t * hop + n_fft] += window ** 2
    pad = n_fft // 2
    out = out[:, pad:pad + length] / np.maximum(norm[pad:pad + length], 1e-8)
    return out


def _run_model(session, mix, n_fft, dim_f, dim_t, log=print):
    window = np.hanning(n_fft + 1)[:-1]  # periodic Hann, like torch.hann_window
    n_bins = n_fft // 2 + 1
    chunk = HOP * (dim_t - 1)
    trim = n_fft // 2
    gen = chunk - 2 * trim
    n = mix.shape[1]
    pad = gen - n % gen
    mix_p = np.concatenate([np.zeros((2, trim)), mix, np.zeros((2, pad)), np.zeros((2, trim))], axis=1)
    out = []
    starts = range(0, n + pad, gen)
    for k, i in enumerate(starts):
        wave = mix_p[:, i:i + chunk]
        spec = _stft(wave, n_fft, HOP, window)[:, :dim_f]  # (2, dim_f, dim_t)
        inp = np.stack([spec[0].real, spec[0].imag, spec[1].real, spec[1].imag])[None].astype(np.float32)
        # "denoise" trick from UVR: average f(x) and -f(-x) to cancel model noise.
        pred = 0.5 * (session.run(None, {"input": inp})[0] - session.run(None, {"input": -inp})[0])
        p = pred[0]
        full = np.zeros((2, n_bins, p.shape[-1]), dtype=np.complex128)
        full[0, :dim_f] = p[0] + 1j * p[1]
        full[1, :dim_f] = p[2] + 1j * p[3]
        out.append(_istft(full, n_fft, HOP, window, chunk)[:, trim:-trim])
        log(f"\r  separating vocals... {100 * (k + 1) // len(starts)}%", end="")
    log("")
    return np.concatenate(out, axis=1)[:, :n]


def separate_vocals(mix, sr, models=("UVR-MDX-NET-Voc_FT.onnx",), log=print):
    """Return (vocals, instrumental), both shaped (n_samples, 2).

    instrumental is computed as mix - vocals so that recombining the two
    reproduces the original mix exactly.
    """
    import onnxruntime as ort
    import librosa

    if mix.ndim == 1:
        mix = np.stack([mix, mix], axis=1)
    x = mix.T.astype(np.float64)
    if sr != 44100:
        x = librosa.resample(x, orig_sr=sr, target_sr=44100)
    estimates = []
    for name in models:
        n_fft, dim_f, dim_t, comp = MODELS[name]
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        sess = ort.InferenceSession(_model_path(name, log), opts, providers=["CPUExecutionProvider"])
        estimates.append(_run_model(sess, x, n_fft, dim_f, dim_t, log) * comp)
    vocals = np.mean(estimates, axis=0)
    if sr != 44100:
        vocals = librosa.resample(vocals, orig_sr=44100, target_sr=sr)[:, :mix.shape[0]]
    vocals = vocals.T
    return vocals, mix - vocals
