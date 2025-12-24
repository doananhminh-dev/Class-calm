const start = async () => {
  alert("START CALLED"); // test, xong có thể xoá

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  const audioContext = new AudioContext();
  await audioContext.resume();

  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 2048;

  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);

  const dataArray = new Uint8Array(analyser.fftSize);

  // ===== THÊM BIẾN GIỮ TRẠNG THÁI =====
  let smoothDb = 0;          // dB đã làm mượt
  let peakDb = 0;            // peak hold
  const SMOOTHING = 0.1;     // ~0.5s (càng nhỏ càng mượt)
  const PEAK_FALL = 0.4;     // tốc độ peak tụt
  const VIBRATE_LIMIT = 80;  // ngưỡng rung

  let lastVibrate = 0;

  const update = () => {
    analyser.getByteTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128;
      sum += v * v;
    }

    const rms = Math.sqrt(sum / dataArray.length);

    // dB gốc (đo thật)
    const rawDb = Math.min(100, Math.max(0, rms * 120));

    // ===== SMOOTHING (0.5s) =====
    smoothDb = smoothDb + (rawDb - smoothDb) * SMOOTHING;

    // ===== PEAK HOLD =====
    if (smoothDb > peakDb) {
      peakDb = smoothDb;
    } else {
      peakDb -= PEAK_FALL;
      if (peakDb < smoothDb) peakDb = smoothDb;
      if (peakDb < 0) peakDb = 0;
    }

    // ===== RUNG KHI QUÁ NGƯỠNG =====
    const now = Date.now();
    if (
      peakDb >= VIBRATE_LIMIT &&
      navigator.vibrate &&
      now - lastVibrate > 1000
    ) {
      navigator.vibrate(200);
      lastVibrate = now;
    }

    // ===== GỬI GIÁ TRỊ RA UI =====
    setDb(Math.round(peakDb));

    requestAnimationFrame(update);
  };

  update();
};
