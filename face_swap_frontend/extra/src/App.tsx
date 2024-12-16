import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import { io } from 'socket.io-client';

function App() {
  const [token, setToken] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [activeTab, setActiveTab] = useState('image');
  const [credit, setCredit] = useState<number | null>(null);
  const [showPopup, setShowPopup] = useState(false);
  const [targetImage, setTargetImage] = useState<string>("");
  const [sourceImage, setSourceImage] = useState<string>("");
  const [isSingleFace, setIsSingleFace] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [targetImageType, setTargetImageType] = useState<'file' | 'url'>('url');
  const [sourceImageType, setSourceImageType] = useState<'file' | 'url'>('url');
  const [targetDetectionResult, setTargetDetectionResult] = useState(null);
  const [sourceDetectionResult, setSourceDetectionResult] = useState(null);
  const [faceEnhance, setFaceEnhance] = useState(false);
  const [swapResult, setSwapResult] = useState<string | null>(null);
  const [swapStatus, setSwapStatus] = useState<string>('');
  const [showResultPopup, setShowResultPopup] = useState(false);
  const [videoFaceEnhance, setVideoFaceEnhance] = useState(true);
  const [targetVideo, setTargetVideo] = useState<string>("https://static.website-files.org/assets/videos/faceswap/gallery/dance/a0597d74-dd0f-40c1-920e-45bdf180955c.mp4");
  const [videoResult, setVideoResult] = useState<string | null>(null);
  const [showVideoResultPopup, setShowVideoResultPopup] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitted(true);
  };

  const checkTokenBalance = async () => {
    try {
      const response = await axios.get('https://openapi.akool.com/api/open/v3/faceswap/quota/info', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      setCredit(response.data.data.credit);
      setShowPopup(true);
    } catch (error) {
      console.error('Error fetching token balance:', error);
    }
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        }
      };
      reader.onerror = error => reject(error);
    });
  };

  const detectFace = async (image: File | string, type: 'file' | 'url') => {
    try {
      let requestBody: any = {
        single_face: isSingleFace,
        face_enhance: faceEnhance ? 1 : 0
      };

      if (type === 'file' && image instanceof File) {
        const base64Data = await convertFileToBase64(image);
        requestBody.img = base64Data;
      } else if (type === 'url' && typeof image === 'string') {
        requestBody.image_url = image;
      }

      const response = await axios.post('https://sg3.akool.com/detect', requestBody, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error detecting face:', error);
      throw error;
    }
  };

  useEffect(() => {
    // Initialize socket connection when component mounts
    const socket = io('http://localhost:3008', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      timeout: 10000,
      autoConnect: true,
    });

    // Connection event handlers
    socket.on('connect', () => {
      console.log('WebSocket connected successfully');
    });

    socket.on('connect_error', (error) => {
      console.error('Connection Error:', error);
      // Attempt to reconnect
      setTimeout(() => {
        socket.connect();
      }, 1000);
    });

    socket.on('disconnect', (reason) => {
      console.log('Disconnected:', reason);
      if (reason === 'io server disconnect') {
        // Reconnect if server disconnected
        socket.connect();
      }
    });

    socket.on('faceswap_status', (message) => {
      console.log('Received status update:', message);
      
      setIsLoading(message.status !== 3 && message.status !== 4);
      
      if (message.type === 'error') {
        alert(message.message);
        setSwapStatus('Failed');
      } else {
        setSwapStatus(message.message);
        if (message.status === 3 && message.data.url) {
          // Check if the URL ends with a video extension
          const isVideo = /\.(mp4|mov|avi|wmv|flv|mkv)$/i.test(message.data.url);
          
          if (isVideo) {
            setVideoResult(message.data.url);
            setShowVideoResultPopup(true);
          } else {
            setSwapResult(message.data.url);
            setShowResultPopup(true);
          }
        }
      }
    });

    // Cleanup
    return () => {
      if (socket) {
        socket.disconnect();
      }
    };
  }, []);

  const handleSwap = async () => {
    if (!targetImage || !sourceImage) return;
    
    setIsLoading(true);
    setSwapResult(null);
    setSwapStatus('Starting process...');
    
    try {
      // First detect faces in both images
      const targetResult = await detectFace(targetImage, targetImageType);
      const sourceResult = await detectFace(sourceImage, sourceImageType);
      
      setTargetDetectionResult(targetResult);
      setSourceDetectionResult(sourceResult);

      // Validate face detection results
      if (!targetResult.landmarks_str || !sourceResult.landmarks_str) {
        throw new Error('No face landmarks detected in one or both images');
      }

      // Get the correct image paths based on image type
      let targetPath = targetImageType === 'url' ? targetImage as string : targetResult.origin_url;
      let sourcePath = sourceImageType === 'url' ? sourceImage as string : sourceResult.origin_url;

      // If the image is a file, convert it to base64
      if (targetImageType === 'file' && targetImage instanceof File) {
        targetPath = await convertFileToBase64(targetImage);
      }
      if (sourceImageType === 'file' && sourceImage instanceof File) {
        sourcePath = await convertFileToBase64(sourceImage);
      }

      // Prepare the data for face swap API with correct format
      const faceSwapData = {
        sourceImage: [{
          path: sourcePath,
          opts: sourceResult.landmarks_str
        }],
        targetImage: [{
          path: targetPath,
          opts: targetResult.landmarks_str
        }],
        face_enhance: faceEnhance ? 1 : 0,
        modifyImage: targetPath,
        webhookUrl: "https://c184-219-91-134-123.ngrok-free.app/api/webhook"
      };

      console.log('Face swap data:', faceSwapData); // Debug log

      const faceSwapResponse = await axios.post(
        'https://openapi.akool.com/api/open/v3/faceswap/highquality/specifyimage',
        faceSwapData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      setSwapStatus('Request sent, waiting for processing...');

    } catch (error) {
      console.error('Error during face swap:', error);
      setSwapStatus(error instanceof Error ? error.message : 'Failed to initiate face swap');
      setIsLoading(false);
    }
  };

  const handleVideoSwap = async () => {
    if (!targetImage || !sourceImage || !targetVideo) return;
    
    setIsLoading(true);
    setSwapResult(null);
    setSwapStatus('Starting video process...');
    
    try {
      // Get landmarks for source image
      const sourceResponse = await axios.post('https://sg3.akool.com/detect', {
        single_face: false,
        image_url: sourceImage
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const sourceLandmarksStr = sourceResponse.data.landmarks_str;
      
      // Get landmarks for target image
      const targetResponse = await axios.post('https://sg3.akool.com/detect', {
        single_face: false,
        image_url: targetImage
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const targetLandmarksStr = targetResponse.data.landmarks_str;
      
      // Make sure landmarks are strings, not arrays
      const sourceOpts = Array.isArray(sourceLandmarksStr) ? sourceLandmarksStr[0] : sourceLandmarksStr;
      const targetOpts = Array.isArray(targetLandmarksStr) ? targetLandmarksStr[0] : targetLandmarksStr;
      
      // Make the video swap API call with string opts
      const videoSwapData = {
        sourceImage: [{
          path: sourceImage,
          opts: sourceOpts
        }],
        targetImage: [{
          path: targetImage,
          opts: targetOpts
        }],
        face_enhance: videoFaceEnhance ? 1 : 0,
        modifyVideo: targetVideo,
        webhookUrl: "https://c184-219-91-134-123.ngrok-free.app/api/webhook"
      };

      console.log(videoSwapData);
      

      const videoSwapResponse = await axios.post(
        'https://openapi.akool.com/api/open/v3/faceswap/highquality/specifyvideo',
        videoSwapData,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      setSwapStatus('Video request sent, waiting for processing...');

    } catch (error) {
      console.error('Error during video face swap:', error);
      setSwapStatus(error instanceof Error ? error.message : 'Failed to initiate video face swap');
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isLoading) {
      document.body.classList.add('loading');
    } else {
      document.body.classList.remove('loading');
    }
  }, [isLoading]);

  const handleDownload = async () => {
    if (!swapResult) return;
    
    try {
      // Create a new image element
      const img = new Image();
      img.crossOrigin = "anonymous";  // Try to request with CORS
      
      // Create a canvas to draw the image
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      
      // Return a promise that resolves when the image loads
      await new Promise((resolve, reject) => {
        img.onload = () => {
          // Set canvas size to match image
          canvas.width = img.width;
          canvas.height = img.height;
          
          // Draw image to canvas
          ctx?.drawImage(img, 0, 0);
          
          try {
            // Convert canvas to blob and download
            canvas.toBlob((blob) => {
              if (blob) {
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'face-swap-result.png';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
              }
            }, 'image/png');
          } catch (err) {
            reject(err);
          }
          resolve(null);
        };
        
        img.onerror = () => {
          // If CORS fails, try direct download as a fallback
          const a = document.createElement('a');
          a.href = swapResult;
          a.download = 'face-swap-result.png';
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          resolve(null);
        };
        
        // Set image source after setting up handlers
        img.src = swapResult;
      });
      
    } catch (error) {
      console.error('Error downloading image:', error);
      // If all else fails, open in new tab
      window.open(swapResult, '_blank');
    }
  };

  // Add effect to update URLs when tab changes
  useEffect(() => {
    if (activeTab === 'video') {
      setTargetImage("https://i.ibb.co/2FBNRCt/target1.png");
      setSourceImage("https://i.ibb.co/GxHH1J6/source1.png");
    } else {
      setTargetImage("https://d21ksh0k4smeql.cloudfront.net/crop_1694593694387-4562-0-1694593694575-0526.png");
      setSourceImage("https://d21ksh0k4smeql.cloudfront.net/crop_1705462509874-9254-0-1705462510015-9261.png");
    }
  }, [activeTab]);

  // Add video download handler
  const handleVideoDownload = async () => {
    if (!videoResult) return;
    
    try {
      const response = await fetch(videoResult);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'face-swap-result.mp4';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading video:', error);
      window.open(videoResult, '_blank');
    }
  };

  return (
    <div className="app-container">
      {!isSubmitted ? (
        <div className="welcome-container">
          <div className={`welcome-content ${isSubmitted ? 'fade-out' : 'fade-in'}`}>
            <div className="title-container">
              <img src="/images/4p6vr8j7vbom4axo7k0 2.png" alt="Face Swap AI Logo" className="logo" />
              <h1 className="title">Face Swap AI</h1>
            </div>
            <p className="subtitle">Welcome to the next generation of face swapping</p>
            
            <form onSubmit={handleSubmit} className="token-form">
              <input
                type="text"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Enter your API token"
                className="token-input"
                required
              />
              <button type="submit" className="submit-button">
                Get Started
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="main-container">
          <div className="main-header">
            <div className="header-left">
              <img src="/images/4p6vr8j7vbom4axo7k0 2.png" alt="Face Swap AI Logo" className="logo" />
              <h1 className="title">Face Swap AI</h1>
            </div>
            <button className="balance-button" onClick={checkTokenBalance}>Check Token Balance</button>
          </div>
          <div className="tabs">
            <button
              className={`tab ${activeTab === 'image' ? 'active' : ''}`}
              onClick={() => setActiveTab('image')}
            >
              Image Face Swap
            </button>
            <button
              className={`tab ${activeTab === 'video' ? 'active' : ''}`}
              onClick={() => setActiveTab('video')}
            >
              Video Face Swap
            </button>
          </div>
          <div className="tab-content">
            {activeTab === 'image' ? (
              <div className="content">
                <div className="image-swap-form">
                  <div className="image-input-group">
                    <h3>Target Image</h3>
                    <input
                      type="url"
                      placeholder="Enter image URL"
                      onChange={(e) => setTargetImage(e.target.value)}
                      className="url-input"
                    />
                  </div>

                  <div className="image-input-group">
                    <h3>Source Image</h3>
                    <input
                      type="url"
                      placeholder="Enter image URL"
                      onChange={(e) => setSourceImage(e.target.value)}
                      className="url-input"
                    />
                  </div>

                  <div className="checkbox-group">
                    <label>
                      <input
                        type="checkbox"
                        checked={isSingleFace}
                        onChange={(e) => setIsSingleFace(e.target.checked)}
                      />
                      Single Face
                    </label>
                    <label>
                      <input
                        type="checkbox"
                        checked={faceEnhance}
                        onChange={(e) => setFaceEnhance(e.target.checked)}
                      />
                      Face Enhance
                    </label>
                  </div>

                  <button 
                    className="swap-button"
                    onClick={handleSwap}
                    disabled={!targetImage || !sourceImage || isLoading}
                  >
                    Swap Faces
                  </button>
                </div>

                {isLoading && (
                  <div className="loader-overlay">
                    <div className="loader"></div>
                    <p>Processing your images...</p>
                  </div>
                )}

                {swapResult && (
                  <div className="result-container">
                    <h3>Result:</h3>
                    <img src={swapResult} alt="Face Swap Result" className="result-image" />
                  </div>
                )}

                {swapStatus && (
                  <div className="status-message">
                    Status: {swapStatus}
                  </div>
                )}
              </div>
            ) : (
              <div className="content video-swap-content">
                <div className="image-swap-form video-form">
                  <div className="image-input-group">
                    <h3>Source Image</h3>
                    <div className="video-input-wrapper">
                      <i className="image-icon">🖼️</i>
                      <input
                        type="url"
                        placeholder="Enter source image URL"
                        value={sourceImage}
                        onChange={(e) => setSourceImage(e.target.value)}
                        className="url-input video-url-input"
                      />
                    </div>
                  </div>

                  <div className="image-input-group">
                    <h3>Target Image</h3>
                    <div className="video-input-wrapper">
                      <i className="image-icon">🖼️</i>
                      <input
                        type="url"
                        placeholder="Enter target image URL"
                        value={targetImage}
                        onChange={(e) => setTargetImage(e.target.value)}
                        className="url-input video-url-input"
                      />
                    </div>
                  </div>

                  <div className="image-input-group">
                    <h3>Target Video</h3>
                    <div className="video-input-wrapper">
                      <i className="video-icon">🎥</i>
                      <input
                        type="url"
                        placeholder="Enter target video URL"
                        value={targetVideo}
                        onChange={(e) => setTargetVideo(e.target.value)}
                        className="url-input video-url-input"
                      />
                    </div>
                  </div>

                  <div className="video-options">
                    <label className="video-enhance-toggle">
                      <input
                        type="checkbox"
                        checked={videoFaceEnhance}
                        onChange={(e) => setVideoFaceEnhance(e.target.checked)}
                      />
                      <span className="toggle-label">Face Enhance</span>
                    </label>
                  </div>

                  <button 
                    className="swap-button video-swap-button"
                    onClick={handleVideoSwap}
                    disabled={!targetImage || !sourceImage || isLoading}
                  >
                    Swap Video Faces
                  </button>
                </div>

                {isLoading && (
                  <div className="loader-overlay">
                    <div className="loader"></div>
                    <p>Processing your video...</p>
                  </div>
                )}

                {swapStatus && (
                  <div className="status-message video-status">
                    Status: {swapStatus}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {showPopup && (
        <div className="popup">
          <div className="popup-content">
            <p>Your current credit balance is:</p>
            <p className="credit-balance">{credit}</p>
            <button onClick={() => setShowPopup(false)} className="submit-button">OK</button>
          </div>
        </div>
      )}

      {showResultPopup && swapResult && (
        <div className="result-popup-overlay">
          <div className="result-popup">
            <button 
              className="close-button"
              onClick={() => setShowResultPopup(false)}
            >
              ×
            </button>
            <h2>Face Swap Result</h2>
            <div className="result-image-container">
              <img src={swapResult} alt="Face Swap Result" />
            </div>
            <div className="result-actions">
              <button 
                className="download-button"
                onClick={handleDownload}
              >
                Download Image
              </button>
              <button 
                className="close-popup-button"
                onClick={() => setShowResultPopup(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {showVideoResultPopup && videoResult && (
        <div className="result-popup-overlay">
          <div className="result-popup video-result-popup">
            <button 
              className="close-button"
              onClick={() => setShowVideoResultPopup(false)}
            >
              ×
            </button>
            <h2>Video Face Swap Result</h2>
            <div className="result-video-container">
              <video 
                controls 
                autoPlay 
                loop
                src={videoResult}
                className="result-video"
              >
                Your browser does not support the video tag.
              </video>
            </div>
            <div className="result-actions">
              <a 
                href={videoResult}
                className="download-button"
                download="face-swap-result.mp4"
                target="_blank"
                rel="noopener noreferrer"
              >
                Download Video
              </a>
              <button 
                className="close-popup-button"
                onClick={() => setShowVideoResultPopup(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
