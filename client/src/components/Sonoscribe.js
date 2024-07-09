import React, { useState, useEffect, useRef } from "react";
import io from "socket.io-client";

const SonoScribe = () => {
  const [isCallActive, setIsCallActive] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [aiReply, setAiReply] = useState("");
  const [latency, setLatency] = useState(0);
  const socketRef = useRef(null);
  const mediaRecorderRef = useRef(null);

  useEffect(() => {
    socketRef.current = io("http://localhost:3001");

    socketRef.current.on("transcription", (text) => {
      setTranscript(text);
    });

    socketRef.current.on("ai_reply", (reply) => {
      setAiReply(reply);
    });

    socketRef.current.on("latency", (ms) => {
      setLatency(ms);
    });

    return () => {
      socketRef.current.disconnect();
    };
  }, []);

  const startCall = async () => {
    setIsCallActive(true);
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorderRef.current = new MediaRecorder(stream);
    mediaRecorderRef.current.ondataavailable = (event) => {
      socketRef.current.emit("audio", event.data);
    };

    mediaRecorderRef.current.start(250);
  };

  const endCall = () => {
    setIsCallActive(false);
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
    }
    socketRef.current.emit("end_call");
  };

  const forceInterrupt = () => {
    socketRef.current.emit("force_interrupt");
  };

  return (
    <div className="sonoscribe-container">
      <h1>SonoScribe</h1>
      <p>Real-time AI-powered transcription and conversation</p>
      <button onClick={isCallActive ? endCall : startCall} className="call-button">
        {isCallActive ? 'End Call' : 'Start Call'}
      </button>
      {isCallActive && (
        <button onClick={forceInterrupt} className="interrupt-button">Force Interrupt</button>
      )}
      <div className="latency-indicator">Latency: {latency}ms</div>
      <div className="transcript">
        <h2>Transcript:</h2>
        <p>{transcript}</p>
      </div>
      <div className="ai-reply">
        <h2>AI Reply:</h2>
        <p>{aiReply}</p>
      </div>
    </div>
  );
};

export default SonoScribe;

