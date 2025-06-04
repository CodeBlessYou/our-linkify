const socket = io("http://localhost:3000");

let chatId = prompt("Enter your chatId:");

if (!chatId) {
  chatId = prompt("Please enter chatId, otherwise testing will not work");
}

if (chatId) {
  socket.emit("joinRoom", chatId);
}

let typingTimeout;
const chatFrm = document.getElementById("chatFrm");
const input = document.getElementById("myInput");
const username = document.getElementById("username");
const typingIndicator = document.getElementById("typing");

chatFrm.addEventListener("submit", (event) => {
  // Prevent the default form submission (if needed)
  event.preventDefault();

  socket.emit("sendMessage", {
    userId: username.value,
    content: input.value,
    chatId: chatId,
  });

  socket.emit("stopTyping", { chatId: chatId, username: username.value });
  input.value = "";
});

socket.on("getMessage", (data) => {
  console.log("Get Message Data:", data);
  displayMessage(data);
});

// To display message on the chat list
function displayMessage(data) {
  const li = document.createElement("li");
  li.classList.add("single_message");

  if (data.sender.username !== username.value) {
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

  document.getElementById("chatList").appendChild(li);
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

// For Typing indicator exercise
input.addEventListener("input", () => {
  if (input.value !== "") {
    // Write here code for emit the typing event
    socket.emit("typing", { chatId: chatId, username: username.value });
  }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    // Write here code for emit the stopTyping event
    socket.emit("stopTyping", { chatId: chatId, username: username.value });
  }, 2000); // Stop typing after 2 seconds of inactivity
});

socket.on("showTyping", (message) => {
  // Add this line to show Typing... message
  typingIndicator.innerText = message;
});

socket.on("hideTyping", (username) => {
  // Add this line to stop Typing... message
  typingIndicator.innerText = "";
});
