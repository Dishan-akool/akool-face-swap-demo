from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from Crypto.Cipher import AES
from dotenv import load_dotenv
from flask_socketio import SocketIO, emit
from engineio.async_drivers import gevent
import base64
import json
import time
import os
from datetime import datetime

load_dotenv()

app = Flask(__name__)
# Allow all origins with CORS
CORS(app, resources={r"/*": {"origins": "*"}})

# Simplified SocketIO configuration
socketio = SocketIO(
    app,
    cors_allowed_origins="*",
    async_mode='gevent',
    logger=True,
    engineio_logger=True,  # Add engine IO logging
    ping_timeout=5000,     # Increase ping timeout
    ping_interval=2500     # Adjust ping interval
)

# Store events temporarily in memory
events = []

def generate_aes_decrypt(data_encrypt, client_id, client_secret):
    aes_key = client_secret.encode('utf-8')

    # Ensure the IV is 16 bytes long
    iv = client_id.encode('utf-8')
    iv = iv[:16] if len(iv) >= 16 else iv.ljust(16, b'\0')

    cipher = AES.new(aes_key, AES.MODE_CBC, iv)
    decrypted_data = cipher.decrypt(base64.b64decode(data_encrypt))

    # Handle padding
    padding_len = decrypted_data[-1]
    return decrypted_data[:-padding_len].decode('utf-8')

@app.route('/test-app', methods=['GET'])
def test_app():
    #emit socket event
    socketio.emit('message', {'data': 'Hello, World!'})
    return jsonify({"message": "Hello, World!"}), 200

@app.route('/api/webhook', methods=['POST'])
def webhook():
    print("Webhook received")
    try:
        data = request.get_json()
        print("JSON data received:", data)

        # Extract the encrypted data and metadata
        encrypted_data = data.get('dataEncrypt')
        client_id = os.getenv('CLIENT_ID')
        client_secret = os.getenv('CLIENT_SECRET')

        # Decrypt the data
        decrypted_data = generate_aes_decrypt(encrypted_data, client_id, client_secret)
        print("Decrypted Data:", decrypted_data)
        decrypted_json = json.loads(decrypted_data)

        # Enhanced status handling
        status = decrypted_json.get('status')
        if status is None:
            return jsonify({"error": "Missing status in payload"}), 400

        # Map status codes to meaningful messages
        status_messages = {
            1: "Processing started",
            2: "Processing in progress",
            3: "Processing completed",
            4: "Processing failed"
        }

        message = {
            'type': 'error' if status == 4 else 'status_update',
            'status': status,
            'message': status_messages.get(status, "Unknown status"),
            'data': decrypted_json
        }

        # Emit to all connected clients
        socketio.emit('faceswap_status', message)
        
        return jsonify({
            "success": True,
            "message": "Webhook processed successfully"
        }), 200

    except Exception as e:
        print(f"Error processing webhook: {e}")
        socketio.emit('faceswap_status', {
            'type': 'error',
            'message': f"Error processing webhook: {str(e)}"
        })
        return jsonify({"error": str(e)}), 400


@socketio.on('connect')
def handle_connect():
    print("Client connected")
    emit('message', {'data': 'Connected to server', 'type': 'info'})

@socketio.on('disconnect')
def handle_disconnect():
    print("Client disconnected")


if __name__ == '__main__':
    # Run with debug mode
    socketio.run(
        app, 
        host='0.0.0.0', 
        port=3008, 
        debug=True,
        allow_unsafe_werkzeug=True
    )

