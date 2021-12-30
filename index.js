//File-Portal-RTC © Albert Bregonia 2021

//HTML elements
const loginDialog = document.getElementById(`login-dialog`),
      remoteDialog = document.getElementById(`remote-dialog`),
      remoteInput = document.getElementById(`remote-input`),
      iceDialog = document.getElementById(`ice-dialog`),
      iceInput = document.getElementById(`ice-input`),
      copyICE = document.getElementById(`copy-ice`),
      transferDialog = document.getElementById(`transfer-dialog`),
      fileSelector = document.getElementById(`file-selector`),
      progressBar = document.getElementById(`progress-bar`);

//WebRTC connection
const chunkSize = 256*1024, //256kb per message (WebRTC says this isn't possible but anything higher than this throws an error)
      transferChannelCount = 512 - 1, //-1 for metadata channel, the theoretical maximum is 65535 bc of ports but chrome limits me to 512 channels
      currentTransfer = { //information about the current file transfer
        timeStart: 0,
        counter: 0,
        filename: undefined,
        buffer: undefined,
      }, iceCandidates = [],

rtc = new RTCPeerConnection({iceServers: [{urls: `stun:stun.l.google.com:19302`}]}); //create a WebRTC instance
rtc.onicecandidate = ({candidate}) => candidate && iceCandidates.push(candidate); //if the ice candidate is not null, send it to the peer
rtc.oniceconnectionstatechange = () => {
    switch(rtc.iceConnectionState) {
        case `failed`:
            alert(`Connection failed. Retrying...`);
            rtc.restartIce(); 
            break;
        case `disconnected`:
            alert(`Disconnected`);
            location.reload();
            break;
        case `connected`:
            alert(`Connection Established`);
            hideElements(iceDialog, copyICE);
            break;
    }
};
rtc.ondatachannel = ({channel}) => {
    if(channel.label == `metadata`) {
        rtc.metadataChannel = channel;
        rtc.metadataChannel.onmessage = metadataHandler;
    } else {
        rtc.transferChannels[channel.label] = channel;
        channel.onmessage = transferHandler;
    }
    console.log(`Channel initialized!`);
};

//Handles information about the transfer such as file information and accepting/denying requests to transfer
function metadataHandler({data}) {
    const signal = JSON.parse(data);
    switch(signal.event) {
        case `start`:
            if(!confirm(`Confirm transfer of: '${signal.filename}'`)) {
                alert(`Transfer request for '${signal.filename}' denied`);
                rtc.metadataChannel.send(JSON.stringify({event: `denied`}));
                return;
            }
            alert(`Transfer request for '${signal.filename}' was accepted.`);
            currentTransfer.timeStart = new Date(); //save pending transfer information
            currentTransfer.counter = 0;
            currentTransfer.buffer = new Array(progressBar.max = signal.bufferSize);
            currentTransfer.filename = signal.filename;
            rtc.metadataChannel.send(JSON.stringify({event: `accepted`})); //tell sender to start the transfer
            break;
        case `accepted`:
            alert(`Transfer request for '${currentTransfer.filename}' was accepted.`);
            for(let chunk=0, i=0; chunk<currentTransfer.buffer.byteLength; i++) 
                rtc.transferChannels[i%transferChannelCount] //evenly distribute the chunks of binary data in order to prevent overloading the buffers
                    .send(currentTransfer.buffer.slice(chunk, (chunk+=chunkSize)));
            break;
        case `denied`:
            alert(`Transfer request for '${currentTransfer.filename}' was denied.`);
            resetTransfer(); //delete pending transfer info
            break;
        case `progress`:
            progressBar.value = signal.value;
            if(!signal.value) {
                alert(`Transfer complete. '${currentTransfer.filename}' was sent in ${signal.timeElapsed} seconds`);
                resetTransfer();
            }
            break;
    }
}

//Handles data being sent on a file transfer channel and reassembling the chunks into a file
function transferHandler({target, data}) {
    let index = parseInt(target.label), 
        end = currentTransfer.buffer.length - 1;
    while(currentTransfer.buffer[index])          //data at certain indicies will be sent on the channel that they are a modulus of.
        if((index += transferChannelCount) > end) //indicies: [0, 512, 1024, ...] will be sent on channel 0 as n%channelCount == 0
            index = end;                          //indicies: [1, 513, 1025, ...] will be sent on channel 1 as n%channelCount == 1 ... etc
    currentTransfer.buffer[index] = data;
    progressBar.value = currentTransfer.counter++;
    rtc.metadataChannel.send(JSON.stringify({event: `progress`, value: currentTransfer.counter})); //send progress to sender
    if(currentTransfer.counter == end+1) {
        const duration = (new Date() - currentTransfer.timeStart)/1000.0;
        console.log(`Elapsed: ${duration} seconds`);
        const link = document.createElement(`a`);
        hideElements(link);
        link.href = URL.createObjectURL(new Blob(currentTransfer.buffer));
        link.download = currentTransfer.filename;
        link.click();
        //reset transfer information
        rtc.metadataChannel.send(JSON.stringify({event: `progress`, value: 0, timeElapsed: duration}));
        resetTransfer();
    }
}

function resetTransfer() {
    progressBar.value =
        currentTransfer.timeStart = 
        currentTransfer.counter = 0;
    currentTransfer.buffer =
        currentTransfer.filename = undefined;
}

async function rtcSetup(sending) {
    //event handlers
    remoteDialog.onsubmit = () => {
        (async () => {
            await rtc.setRemoteDescription(JSON.parse(atob(remoteInput.value)));
            if(!sending) {
                const answer = await rtc.createAnswer();
                await rtc.setLocalDescription(answer);
                await navigator.clipboard.writeText(btoa(JSON.stringify(answer)));
                alert(`Successfully saved remote ID. Local ID has been copied to your clipboard. Please send this to your peer.`);
            } else {
                alert(`Successfully saved remote ID. Please copy your local connection info and send it to your peer.`);
            }
            hideElements(remoteDialog);
        })();
        return false;
    };
    iceDialog.onsubmit = () => {
        (async () => {
            for(const ice of JSON.parse(atob(iceInput.value)))
                rtc.addIceCandidate(ice);
            alert(`Successfully saved remote connection info.`);
        })();
        return false;
    };
    copyICE.onclick = async () => {
        await navigator.clipboard.writeText(btoa(JSON.stringify(iceCandidates)));
        alert(`Local connection info has been copied to your clipboard. Please send this to your peer.`);
    };
    transferDialog.onsubmit = () => {
        if(!fileSelector.files) {
            alert(`No files selected. Please select a file before sending.`);
            return;
        } else if(fileSelector.files.length != 1 || currentTransfer.buffer) {
            alert(`Only 1 file is allowed to be sent at a time.`);
            return;
        }
        const file = fileSelector.files[0],
              reader = new FileReader();
        if(!confirm(`Confirm transfer of: '${file.name}'`)) {
            alert(`Transfer cancelled`);
            return;
        }
        reader.onload = ({target}) => {
            const fileContent = target.result;
            rtc.metadataChannel.send(JSON.stringify({ //send a request to transfer the file
                event: `start`,
                bufferSize: Math.ceil(1.0*fileContent.byteLength/chunkSize),
                filename: file.name,
            }));
            //save information about the pending transfer
            progressBar.value = 0;
            progressBar.max = Math.ceil(1.0*fileContent.byteLength/chunkSize);
            currentTransfer.buffer = fileContent;
            currentTransfer.filename = file.name;
        };
        reader.readAsArrayBuffer(file);
        return false;
    };
    //selection specific setup
    hideElements(loginDialog);
    rtc.transferChannels = new Array(transferChannelCount);
    if(sending) { //create metadata and file transfer channels
        const channelErrorHandler = ({error}) => console.error(error);
        rtc.metadataChannel = rtc.createDataChannel(`metadata`);
        rtc.metadataChannel.onerror = channelErrorHandler;
        rtc.metadataChannel.onmessage = metadataHandler;
        for(let i=0; i<transferChannelCount; i++) { //`channelCount` channels are created in order to spread out the data and not overload the buffer
            const channel = rtc.transferChannels[i] = rtc.createDataChannel(i);
            channel.onmessage = transferHandler;
            channel.onerror = channelErrorHandler;
        }
        const offer = await rtc.createOffer();
        await rtc.setLocalDescription(offer);
        await navigator.clipboard.writeText(btoa(JSON.stringify(offer)));
        alert(`Local ID has been copied to your clipboard. Please send this to your peer`);
    } else {
        alert(`Waiting for remote ID...`);
    }
}

function hideElements(...elements) {
    for(const element of elements)
        element.style.display = `none`;
}