const express = require('express');
const multer = require('multer');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const useragent = require('useragent'); // For detecting device type
const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 3000;

let receivers = [];

// Helper function to generate a random name
const generateRandomName = () => {
  const names = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Theta', 'Lambda', 'Omega'];
  return names[Math.floor(Math.random() * names.length)];
};

// Set storage engine for multer
const storage = multer.diskStorage({
  destination: './uploads',
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  }
});

// Init multer for file uploads
const upload = multer({
  storage: storage
}).single('file');

// Serve static files from public directory
app.use(express.static('public'));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// WebSocket connection handling
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Identify device type using user-agent
  const agent = useragent.parse(socket.handshake.headers['user-agent']);
  let deviceType = 'Unknown';
  if (agent.os.family === 'Android') {
    deviceType = 'Android';
  } else if (agent.os.family === 'iOS') {
    deviceType = 'iPhone';
  } else if (agent.os.family.includes('Mac')) {
    deviceType = 'Mac';
  } else if (agent.os.family.includes('Windows')) {
    deviceType = 'Windows';
  }

  // Assign a random name to this device
  const deviceName = `${generateRandomName()} (${deviceType})`;

  // If the user is ready to receive, add them to the list of receivers
  socket.on('ready-to-receive', () => {
    receivers.push({ id: socket.id, name: deviceName });
    console.log(`Receiver ${deviceName} (${socket.id}) is ready.`);
    
    // Broadcast updated receiver list to all senders
    io.emit('receivers-list', receivers.map(receiver => receiver.name));
  });

  // If the user requests the list of receivers (sender view)
  socket.on('request-receivers', () => {
    socket.emit('receivers-list', receivers.map(receiver => receiver.name));
  });

  // Handle file upload progress for the selected receiver
  socket.on('upload-progress', (data) => {
    const { percent, filename, receiverName } = data;
    const receiver = receivers.find(r => r.name === receiverName);
    if (receiver) {
      io.to(receiver.id).emit('receive-progress', { percent, filename });
    }
  });

  // Remove user from receivers list on disconnect
  socket.on('disconnect', () => {
    receivers = receivers.filter(r => r.id !== socket.id);
    console.log('A user disconnected:', socket.id);

    // Update receivers list for all clients
    io.emit('receivers-list', receivers.map(receiver => receiver.name));
  });
});

// Upload file endpoint
app.post('/upload', (req, res) => {
  upload(req, res, (err) => {
    if (err) {
      return res.status(500).send('Error uploading file.');
    }

    const receiverName = req.query.receiver;
    const fileUrl = `/uploads/${req.file.originalname}`;

    // Notify the selected receiver that the file is ready
    const receiver = receivers.find(r => r.name === receiverName);
    if (receiver) {
      io.to(receiver.id).emit('file-ready', { fileUrl, filename: req.file.originalname });
    }

    res.send('File uploaded successfully.');
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});