# Turns clean recordings into a worn 1980s radio: small speaker band, drive, wow & flutter,
# hiss, crackle, shortwave fading; builds the jammed Radio Free Europe broadcast and a tuning sweep.
import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt

SR = 22050
rng = np.random.default_rng(1986)

def load(name):
    sr, x = wavfile.read(name + '.wav')
    x = x.astype(np.float32) / 32768
    return x / (np.abs(x).max() + 1e-9)

def band(x, lo, hi, order=4):
    return sosfilt(butter(order, [lo, hi], 'bandpass', fs=SR, output='sos'), x)

def wow(x, depth=0.0025, rate=0.45, flutter=0.0008):
    t = np.arange(len(x)) / SR
    speed = 1 + depth * np.sin(2 * np.pi * rate * t) + flutter * np.sin(2 * np.pi * 7.3 * t + 1.1)
    pos = np.cumsum(speed) - speed[0]
    pos = np.clip(pos, 0, len(x) - 1)
    return np.interp(pos, np.arange(len(x)), x)

def hiss(n, level):
    return band(rng.standard_normal(n), 1200, 7000, 2) * level

def crackle(n, rate=6.0, level=0.35):
    out = np.zeros(n)
    idx = rng.integers(0, n, int(rate * n / SR))
    out[idx] = rng.uniform(-1, 1, len(idx)) * level
    return band(out, 800, 6000, 2)

def fading(n, depth, rate):
    t = np.arange(n) / SR
    f = 1 - depth * (0.5 + 0.5 * np.sin(2 * np.pi * rate * t + rng.uniform(0, 6)) *
                     np.sin(2 * np.pi * rate * 0.37 * t + rng.uniform(0, 6)))
    return f

def radio(x, lo=320, hi=3000, drive=2.2, hiss_level=0.05, fade=0.25, fade_rate=0.11):
    y = band(wow(x), lo, hi)
    y = np.tanh(y * drive) / np.tanh(drive)
    y *= fading(len(y), fade, fade_rate)
    y += hiss(len(y), hiss_level) + crackle(len(y))
    return y

def save(name, y, gain=0.8):
    y = y / (np.abs(y).max() + 1e-9) * gain
    wavfile.write(name + '.wav', SR, (y * 32767).astype(np.int16))

for name in ['trei_culori', 'te_slavim', 'zdrobite_catuse', 'e_scris_pe_tricolor']:
    save('out_' + name, radio(load(name)))

# Radio Free Europe: the voice twice, with pauses, under a Soviet-style jammer.
voice = load('rfe_voice')
gap = np.zeros(int(SR * 2.5))
v = np.concatenate([gap, voice, gap, voice * 0.9, gap])
n = len(v)
t = np.arange(n) / SR
# jammer: rasping buzz (pulse train) whose pitch drifts, plus bursts of roar
buzz_f = 180 + 60 * np.sin(2 * np.pi * 0.23 * t) + 25 * np.sin(2 * np.pi * 1.7 * t)
buzz = np.sign(np.sin(2 * np.pi * np.cumsum(buzz_f) / SR)) * 0.5
roar = band(rng.standard_normal(n), 300, 2500, 2) * (0.6 + 0.4 * np.sin(2 * np.pi * 0.31 * t) ** 2)
jam_env = 0.35 + 0.3 * (0.5 + 0.5 * np.sin(2 * np.pi * 0.07 * t))
jam = band(buzz + roar, 250, 3000) * jam_env
wobble = np.sin(2 * np.pi * np.cumsum(1200 + 300 * np.sin(2 * np.pi * 0.05 * t)) / SR) * 0.06
y = radio(v, lo=350, hi=2800, drive=1.8, hiss_level=0.08, fade=0.55, fade_rate=0.19) + jam * 0.55 + wobble
save('out_europa_libera', y)

# Turning the dial of an AM set: the knob clicks, the carrier drops into static, and fragments
# of other stations (muffled music, a voice) swell and vanish as the dial passes them. No whistle.
n = int(SR * 1.3)
t = np.arange(n) / SR
static = band(rng.standard_normal(n), 300, 4000, 2)
static *= 0.35 + 0.25 * np.abs(np.sin(2 * np.pi * 2.3 * t + 0.4))
passing = np.zeros(n)
for src, at, width in [('te_slavim', 0.28, 0.16), ('rfe_voice', 0.62, 0.14), ('zdrobite_catuse', 0.95, 0.12)]:
    x = load(src)
    start = rng.integers(SR * 5, len(x) - n)
    frag = band(x[start:start + n], 400, 2200)
    passing += frag * np.exp(-((t - at) / width) ** 2) * 1.4
dial = static + passing + crackle(n, 40, 0.5)
dial *= np.minimum(1, t / 0.04) * np.minimum(1, (t[-1] - t) / 0.25)
knob = np.zeros(n)
knob[:int(SR * 0.012)] = rng.standard_normal(int(SR * 0.012)) * np.exp(-np.arange(int(SR * 0.012)) / 40)
save('out_tuning', np.tanh(dial * 1.3) + knob * 0.8, gain=0.55)
