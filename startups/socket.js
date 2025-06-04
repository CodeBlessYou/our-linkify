const jwt = require("jsonwebtoken");

const Chat = require("../models/chats");
const Message = require("../models/messages");

module.exports = function (io) {
  const onlineUsers = new Map();

  io.use((socket, next) => {
    const token = socket.handshake.auth.token;

    if (!token) {
      return next(new Error("Authentication error! Token required!"));
    }

    try {
      const user = jwt.verify(token, process.env.JWT_KEY);
      socket.user = user;
      console.log("Socket User", socket.user);

      next();
    } catch (error) {
      return next(new Error("Authentication error! Token required!"));
    }
  });

  io.on("connection", (socket) => {
    console.log("A user connected");
    const userId = socket.user._id;

    socket.emit("userData", socket.user);
    if (!onlineUsers.has(userId)) {
      onlineUsers.set(userId, new Set());
    }
    onlineUsers.get(userId).add(socket.id);
    console.log("Online users", onlineUsers);

    socket.on("markMessagesAsDelivered", async () => {
      // Find all the chat messages in which our user is available
      const chatIds = await Chat.find({
        participants: userId,
        isGroup: false,
      }).distinct("_id");

      const undeliveredMessage = await Message.find({
        chatId: { $in: chatIds },
        status: "sent",
        sender: { $ne: userId },
      }).select("_id chatId sender");

      if (undeliveredMessage.length > 0) {
        await Message.updateMany(
          { _id: { $in: undeliveredMessage.map((msg) => msg._id) } },
          { $set: { status: "delivered" } }
        );
      }

      // Step 1: Group chatIds by sender
      const groupedChatIds = undeliveredMessage.reduce((acc, msg) => {
        if (!acc[msg.sender]) {
          acc[msg.sender] = new Set();
        }
        acc[msg.sender].add(msg.chatId.toString());
        return acc;
      }, {});

      // Convert Sets to Array
      for (const sender in groupedChatIds) {
        groupedChatIds[sender] = [...groupedChatIds[sender]];
      }

      // Step 2: Send event to online users only
      for (const senderId in groupedChatIds) {
        const sockets = onlineUsers.get(senderId);
        const chatIds = groupedChatIds[senderId];

        if (sockets) {
          sockets.forEach((socketId) => {
            io.to(socketId).emit("messageStatusUpdated", { chatIds });
          });
        }
      }
    });

    socket.on("markGroupMessagesAsDelivered", async () => {
      const chatIds = await Chat.find({
        participants: userId,
        isGroup: true,
      }).distinct("_id");

      const undeliveredMessage = await Message.find({
        chatId: { $in: chatIds },
        sender: { $ne: userId },
        deliveryStatus: {
          $elemMatch: {
            user: userId,
            status: "sent",
          },
        },
      }).select("_id chatId sender deliveryStatus");

      if (undeliveredMessage.length > 0) {
        for (const message of undeliveredMessage) {
          await Message.updateOne(
            { _id: message._id, "deliveryStatus.user": userId },
            {
              $set: {
                "deliveryStatus.$.status": "delivered",
                "deliveryStatus.$.deliveredAt": new Date(),
              },
            }
          );
        }

        // Step 1: Group chatIds by sender
        const groupedChatIds = undeliveredMessage.reduce((acc, msg) => {
          if (!acc[msg.sender]) {
            acc[msg.sender] = new Set();
          }
          acc[msg.sender].add(msg.chatId.toString());
          return acc;
        }, {});

        // Convert Sets to Array
        for (const sender in groupedChatIds) {
          groupedChatIds[sender] = [...groupedChatIds[sender]];
        }

        // Step 2: Send event to online users only
        for (const senderId in groupedChatIds) {
          const sockets = onlineUsers.get(senderId);
          const chatIds = groupedChatIds[senderId];

          if (sockets) {
            sockets.forEach((socketId) => {
              io.to(socketId).emit("messageStatusUpdated", { chatIds });
            });
          }
        }
      }
    });

    socket.on("markMessagesAsSeen", async (chatId) => {
      const unseenMessages = await Message.find({
        chatId: chatId,
        sender: { $ne: userId },
        status: "delivered",
      }).select("_id sender");

      if (unseenMessages.length > 0) {
        await Message.updateMany(
          {
            chatId: chatId,
            sender: { $ne: userId },
            status: "delivered",
          },
          { $set: { status: "seen" } }
        );

        const senderIds = [
          ...new Set(unseenMessages.map((msg) => msg.sender.toString())),
        ];

        for (const sender of senderIds) {
          const sockets = onlineUsers.get(sender);

          if (sockets) {
            sockets.forEach((socketId) => {
              io.to(socketId).emit("messageSeen", {
                chatId: chatId,
                seenBy: userId,
              });
            });
          }
        }
      }
    });

    socket.on("markGroupMessagesAsSeen", async (chatId) => {
      const unseenMessages = await Message.find({
        chatId: chatId,
        sender: { $ne: userId },
        deliveryStatus: {
          $elemMatch: {
            user: userId,
            status: { $ne: "seen" },
          },
        },
      }).select("_id chatId sender deliveryStatus");

      if (unseenMessages.length > 0) {
        for (const message of unseenMessages) {
          await Message.updateOne(
            { _id: message._id, "deliveryStatus.user": userId },
            {
              $set: {
                "deliveryStatus.$.status": "seen",
                "deliveryStatus.$.seenAt": new Date(),
              },
            }
          );
        }

        const senderIds = [
          ...new Set(unseenMessages.map((msg) => msg.sender.toString())),
        ];

        for (const sender of senderIds) {
          const sockets = onlineUsers.get(sender);

          if (sockets) {
            sockets.forEach((socketId) => {
              io.to(socketId).emit("messageSeen", {
                chatId: chatId,
                seenBy: userId,
              });
            });
          }
        }
      }
    });

    socket.on("joinRoom", (chatId) => {
      socket.join(chatId);
      console.log(`User ${socket.id} joined room: ${chatId}`);
    });

    socket.on("typing", ({ chatId }) => {
      socket
        .to(chatId)
        .emit("showTyping", `${socket.user.username} is typing...`);
    });

    socket.on("stopTyping", ({ chatId }) => {
      socket.to(chatId).emit("hideTyping", socket.user.username);
    });

    socket.on("sendMessage", async ({ content, chatId }) => {
      const userId = socket.user._id;
      if (!content) {
        socket.emit(
          "errorInSendMessage",
          "Content(message-text) is must required!"
        );
        return;
      }

      const chat = await Chat.findById(chatId);
      if (!chat || !chat.participants.includes(userId)) {
        socket.emit("errorInSendMessage", "Access Denied");
        return;
      }

      const recipients = chat.participants.filter(
        (id) => id.toString() !== userId
      );

      let deliveryStatus;
      if (chat.isGroup) {
        deliveryStatus = recipients.map((user) => {
          const online = onlineUsers.has(user);
          return {
            user: user,
            status: online ? "delivered" : "sent",
            deliveredAt: online ? new Date() : null,
          };
        });
      }

      const newMessage = new Message({
        chatId: chat._id,
        sender: userId,
        content,
        status: onlineUsers.has(recipients[0].toString())
          ? "delivered"
          : "sent",
        deliveryStatus: deliveryStatus,
      });

      await newMessage.save();

      chat.lastMessage = newMessage._id;
      await chat.save();

      const populateMessage = await Message.findById(newMessage._id)
        .populate("sender", "_id username")
        .populate("deliveryStatus.user", "_id username");

      // io.emit("getMessage", data);
      io.to(chatId).emit("getMessage", populateMessage);
    });

    socket.on("disconnect", () => {
      onlineUsers.get(userId).delete(socket.id);

      if (onlineUsers.get(userId).size === 0) {
        onlineUsers.delete(userId);
      }

      console.log("Online users", onlineUsers);
    });
  });
};
