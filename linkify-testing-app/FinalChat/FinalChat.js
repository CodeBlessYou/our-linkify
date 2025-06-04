let token = prompt("Enter your Token:");

if (!token) {
  token = prompt("Please enter token, otherwise testing will not work");
}

let typingTimeout;
let user;
let messages;
const chatFrm = document.getElementById("chatFrm");
const messageContainer = document.getElementById("messageContainer");
const input = document.getElementById("myInput");
const chatId = document.getElementById("chatId");
const joinRoom = document.getElementById("joinRoom");
const typingIndicator = document.getElementById("typing");

// Only add Socket logic if token is available
if (token) {
  let socket = io("http://localhost:3000", {
    auth: { token: token },
  });

  // Setting user to authenticate user data
  socket.on("userData", (data) => {
    user = data;
  });

  // Catch authentication errors (Socket Middleware error)
  socket.on("connect_error", (err) => {
    console.error("Socket Connection Error:", err.message);
    alert(err.message); // Show error message to the user
  });

  // Mark one-to-one message as delivered when user comes online
  socket.emit("markMessagesAsDelivered");
  // Mark group message as delivered when user comes online
  socket.emit("markGroupMessagesAsDelivered");

  // Status updated to delivered
  socket.on("messageStatusUpdated", (data) => {
    console.log("Updated delivered ChatIds", data.chatIds);
    alert("Your sent messages are delivered");
  });

  // Status updated to seen
  socket.on("messageSeen", (data) => {
    console.log("Message Seen", data);
    alert(`Your messages are seen by user - ${data.seenBy}`);
  });

  // Adding click event on joinRoom button
  joinRoom.addEventListener("click", () => {
    socket.emit("joinRoom", chatId.value);
    // Fetch chat messages
    getMessagesByChatId(chatId.value);
    document.getElementById("chatList").innerHTML = "";

    // Mark all messages in this room as seen
    socket.emit("markMessagesAsSeen", chatId.value);
    // Mark group messages in this room as seen
    socket.emit("markGroupMessagesAsSeen", chatId.value);
  });

  // Adding submit event to form
  chatFrm.addEventListener("submit", (event) => {
    // Prevent the default form submission (if needed)
    event.preventDefault();

    socket.emit("sendMessage", {
      content: input.value,
      chatId: chatId.value,
    });

    input.value = "";
    socket.emit("stopTyping", {
      chatId: chatId.value,
    });
  });

  // Handling getMessage event
  socket.on("getMessage", (data) => {
    console.log("Get Message Data:", data);
    displayMessage(data, true);

    if (data.sender._id !== user._id) {
      socket.emit("markMessagesAsSeen", chatId.value);
    }

    smoothScrollToBottom();
  });

  // Adding event for each input key in Message input
  input.addEventListener("input", () => {
    if (input.value !== "") {
      socket.emit("typing", { chatId: chatId.value });
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      socket.emit("stopTyping", {
        chatId: chatId.value,
      });
    }, 2000); // Stop typing after 2 seconds of inactivity
  });

  // Show "Username is typing..." but NOT for the user who is typing
  socket.on("showTyping", (message) => {
    typingIndicator.innerText = message;
  });

  // Hide typing indicator
  socket.on("hideTyping", () => {
    typingIndicator.innerText = "";
  });

  // Show alert when we have error in send message
  socket.on("errorInSendMessage", (message) => {
    alert(message);
  });
}

// To display the message in message list
function displayMessage(data, sendByUser) {
  const li = document.createElement("li");
  li.classList.add("single_message");

  if (data.sender._id !== user._id) {
    li.innerHTML = `
    <p>${data.content}</p>
    <span>${formatTime(data.createdAt)} - by ${data.sender.username}</span>
    `;
  } else {
    li.classList.add("my_message");
    li.innerHTML = `
      <p>${data.content}</p>
    <span>${formatTime(data.createdAt)} . ${data.status}</span>
    `;
  }

  sendByUser
    ? document.getElementById("chatList").prepend(li)
    : document.getElementById("chatList").appendChild(li);
}

// To print time in human langauge
function formatTime(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

// To fetch messages from the backend
async function getMessagesByChatId(id) {
  const url = `http://localhost:3000/api/chats/${id}/messages`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  const data = await response.json();
  messages = data.messages;
  console.log(data);

  for (const mes of messages) {
    displayMessage(mes, false);
  }

  // Call smoothScrollToBottom with a delay
  setTimeout(smoothScrollToBottom, 500);
}

// Function to smoothly scroll to the bottom
function smoothScrollToBottom() {
  messageContainer.scroll({
    top: messageContainer.scrollHeight,
    behavior: "smooth", // Smooth scrolling
  });
}
