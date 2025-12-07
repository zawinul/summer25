async function initReverb(audioContext) {

    const inputNode = audioContext.createGain();
    inputNode.gain.value = 1;
    const outputNode = audioContext.createGain();
    outputNode.gain.value = 1;

    // rev dry
    const dryNode = audioContext.createGain();
    dryNode.gain.value = 1;

    const wetNode = audioContext.createGain();
    wetNode.gain.value = 0;

    const splitter = audioContext.createChannelSplitter(2);
    const leftConvolution = audioContext.createConvolver();
    const rightConvolution = audioContext.createConvolver();
    const mergeNode = audioContext.createChannelMerger(2);

    inputNode.connect(splitter);
    inputNode.connect(dryNode);
    splitter.connect(leftConvolution, 0);
    splitter.connect(rightConvolution, 1);
    leftConvolution.connect(mergeNode, 0, 0);
    rightConvolution.connect(mergeNode, 0, 1);
    mergeNode.connect(wetNode);

    dryNode.connect(outputNode);
    wetNode.connect(outputNode);

    function setDryWet(wetAmount) {
        wetNode.gain.setTargetAtTime(wetAmount, audioContext.currentTime, 0.01);
        dryNode.gain.setTargetAtTime(1 - wetAmount, audioContext.currentTime, 0.01);
    }

    async function loadIR(revTypeName) {
        let leftURL = 'ir/48k-lr/' + revTypeName + ', 48K L.wav';
        let rightURL = 'ir/48k-lr/' + revTypeName + ', 48K R.wav';
        const lefrResponse = await fetch(leftURL);
        const leftArrayBuffer = await lefrResponse.arrayBuffer();
        const rightResponse = await fetch(rightURL);
        const rightArrayBuffer = await rightResponse.arrayBuffer();
        leftConvolution.buffer = await audioContext.decodeAudioData(leftArrayBuffer);
        rightConvolution.buffer = await audioContext.decodeAudioData(rightArrayBuffer);
    }

    return {
        inputNode,
        outputNode,
        setDryWet,
        loadIR
    }


}