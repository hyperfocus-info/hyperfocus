export type VoiceStream = {
  getTracks(): Pick<MediaStreamTrack, 'enabled' | 'kind' | 'readyState' | 'stop'>[];
  getAudioTracks(): Pick<MediaStreamTrack, 'enabled' | 'kind' | 'readyState' | 'stop' | 'addEventListener'>[];
};
export type VoicePeer = Pick<RTCPeerConnection, 'connectionState' | 'remoteDescription' | 'onicecandidate' | 'ontrack' | 'onconnectionstatechange' | 'close' | 'setRemoteDescription' | 'addIceCandidate' | 'getStats'> & {
  addStream(stream: VoiceStream): void;
  createOffer(options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit>;
  createAnswer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(value: RTCSessionDescriptionInit): Promise<void>;
};
/** Compatible resource port; injected fixtures need not impersonate native resources. */
export type VoiceBrowser = {
  capture(): Promise<VoiceStream>;
  peer(configuration: RTCConfiguration): VoicePeer;
  audio(): HTMLAudioElement;
};
export const voiceBrowser: VoiceBrowser = {
  capture: () => {
    if (!navigator.mediaDevices?.getUserMedia) return Promise.reject(new Error('Microphone access requires HTTPS or localhost and a supported browser.'));
    return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
  },
  peer: configuration => {
    const pc = new RTCPeerConnection(configuration);
    return {
      get connectionState() { return pc.connectionState; },
      get remoteDescription() { return pc.remoteDescription; },
      get onicecandidate() { return pc.onicecandidate; }, set onicecandidate(value) { pc.onicecandidate = value; },
      get ontrack() { return pc.ontrack; }, set ontrack(value) { pc.ontrack = value; },
      get onconnectionstatechange() { return pc.onconnectionstatechange; }, set onconnectionstatechange(value) { pc.onconnectionstatechange = value; },
      addStream(stream) {
        if (!(stream instanceof MediaStream)) throw new TypeError('Native voice requires a native media stream.');
        for (const track of stream.getAudioTracks()) pc.addTrack(track, stream);
      },
      close: () => pc.close(), createOffer: options => pc.createOffer(options), createAnswer: () => pc.createAnswer(),
      setLocalDescription: value => pc.setLocalDescription(value), setRemoteDescription: value => pc.setRemoteDescription(value),
      addIceCandidate: value => pc.addIceCandidate(value), getStats: selector => pc.getStats(selector),
    };
  },
  audio: () => { const audio = document.createElement('audio');audio.autoplay = true;return audio; },
};
