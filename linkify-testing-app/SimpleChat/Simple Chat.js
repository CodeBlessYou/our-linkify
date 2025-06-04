// Connecting to the socket
const socket = io("http://localhost:3000");

// Getting elements
const chatFrm = document.getElementById("chatFrm");
const input = document.getElementById("myInput");
const username = document.getElementById("username");

// To run code on form submit event
chatFrm.addEventListener("submit", (event) => {
  // Prevent the default form submission (Stop page refresh on submit)
  event.preventDefault();

  socket.emit("sendMessage", {
    sender: { _id: 123, username: username.value },
    content: input.value,
    createdAt: new Date(),
    status: "sent",
  });

  input.value = "";
});

socket.on("getMessage", (data) => {
  displayMessage(data);
});

// To display the message in chat list
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
