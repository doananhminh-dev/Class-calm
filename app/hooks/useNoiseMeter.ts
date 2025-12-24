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

  const update = () => {
    analyser.getByteTimeDomainData(dataArray);

    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      const v = (dataArray[i] - 128) / 128;
      sum += v * v;
    }

    const rms = Math.sqrt(sum / dataArray.length);
    const db = Math.min(100, Math.max(0, rms * 120));

    setDb(Math.round(db));
    requestAnimationFrame(update);
  };

  update();
};
