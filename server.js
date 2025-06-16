// server.js
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
  },
});

const users = new Map(); 

app.use(cors());

// app.get('/online-users', (req, res) => {
//   res.json([...users.entries()].map(([id, data]) => ({
//     id,
//     ip: data.ip,
//     connectedTo: data.connectedTo,
//     reported: data.reported,
//   })));
// });
app.use(express.static(path.join(__dirname, 'public'))); 

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

io.on('connection', (socket) => {
  const ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

  console.log(` User connected: ${socket.id} from IP: ${ip}`);

  users.set(socket.id, {
    ip,
    connectedTo: null,
    reported: false,
    lastPartner: null,
  });

  socket.on('find-partner', () => {
    const user = users.get(socket.id);
    if (!user) return;

    for (let [otherSocketId, otherUser] of users) {
      const isEligible = (
        otherSocketId !== socket.id &&
        !otherUser.connectedTo &&
        !otherUser.reported &&
        !user.reported &&
        otherSocketId !== user.lastPartner
      );

      if (isEligible) {
        users.get(socket.id).connectedTo = otherSocketId;
        users.get(otherSocketId).connectedTo = socket.id;

        users.get(socket.id).lastPartner = otherSocketId;
        users.get(otherSocketId).lastPartner = socket.id;

        io.to(socket.id).emit('partner-found', { socketId: otherSocketId });
        io.to(otherSocketId).emit('partner-found', { socketId: socket.id });

        console.log(` Paired: ${socket.id} ⇄ ${otherSocketId}`);
        return;
      }
    }

    socket.emit('no-partner-available');
  });

  socket.on('signal', (data) => {
    if (users.has(data.to)) {
      io.to(data.to).emit('signal', {
        from: socket.id,
        signal: data.signal,
      });
    }
  });

  socket.on('report-user', () => {
    const user = users.get(socket.id);
    const targetId = user?.connectedTo;

    if (targetId && users.has(targetId)) {
      users.get(targetId).reported = true;
      console.log(` Reported user: ${targetId} by ${socket.id}`);
    }
  });

  socket.on('disconnect', () => {
    const user = users.get(socket.id);
    const partnerId = user?.connectedTo;

    if (partnerId && users.has(partnerId)) {
      io.to(partnerId).emit('partner-disconnected');
      users.get(partnerId).connectedTo = null;
    }

    users.delete(socket.id);
    console.log(` User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
