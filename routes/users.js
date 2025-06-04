const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const User = require("../models/users");
const auth = require("../middleware/auth");
const sendEmail = require("../config/amazon-ses");
const sendSMTPEmail = require("../config/smtp");
const router = express.Router();

router.post("/", async (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res
      .status(400)
      .json({ message: "Missing required form fields!", success: false });
  }

  const user = await User.findOne({
    $or: [{ username: username }, { email: email }],
  });

  if (user) {
    return res.status(400).json({
      message:
        user.username === username
          ? "Username is already taken!"
          : "Email is already registered!",
      success: false,
    });
  }

  const hashedPass = await bcrypt.hash(password, 10);

  const newUser = new User({
    username,
    email,
    password: hashedPass,
  });

  await newUser.save();

  const token = generateToken({
    _id: newUser._id,
    username: newUser.username,
  });

  res.status(201).json(token);
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({
      success: false,
      message: "Please provide username and password!",
    });
  }

  const user = await User.findOne({ username });
  if (!user) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid credentials!" });
  }

  const validPassword = await bcrypt.compare(password, user.password);
  if (!validPassword) {
    return res
      .status(401)
      .json({ success: false, message: "Invalid credentials!" });
  }

  const token = generateToken({
    _id: user._id,
    username: user.username,
  });

  res.json(token);
});

router.get("/", auth, async (req, res) => {
  const user = await User.findById(req.user._id).select("-password");

  if (!user) {
    return res.status(404).json({ success: false, message: "User not found!" });
  }

  res.json(user);
});

router.post("/request-password-reset", async (req, res) => {
  const { email } = req.body;
  let user = await User.findOne({ email: email });
  if (!user)
    return res
      .status(404)
      .json({ success: false, message: "This email is not registered!" });

  const resetToken = jwt.sign({ _id: user._id }, process.env.JWT_KEY, {
    expiresIn: "1h",
  });

  user.resetToken = resetToken;
  user.resetTokenExpires = Date.now() + 60 * 60 * 1000;
  await user.save();

  // Send email with this token
  const subject = "Password Reset Request for your linkify account";
  const text = `Click this link to reset your password: https://ourlinkify.com/reset-password?resetToken=${resetToken}`;
  // sendEmail(user.email, subject, text);
  sendSMTPEmail(user.email, subject, text);

  res.json({
    message: "Password reset link sent to email",
    resetToken: resetToken,
  });
});

router.post("/reset-password", async (req, res) => {
  const { resetToken, newPassword } = req.body;

  // Step 1 - Verify the token
  const decodedUser = jwt.verify(resetToken, process.env.JWT_KEY);
  let user = await User.findById(decodedUser._id);
  if (
    !user ||
    user.resetToken !== resetToken ||
    user.resetTokenExpires <= Date.now()
  ) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid or expired token!" });
  }

  // Step 2 - If token is verified then update the password
  user.password = await bcrypt.hash(newPassword, 10);
  user.resetToken = null;
  user.resetTokenExpires = null;
  await user.save();

  res.json({ message: "Password reset successfully!" });
});

router.post("/:userId/follow", auth, async (req, res) => {
  const userId = req.params.userId;
  const currentUserId = req.user._id;

  if (userId === currentUserId)
    return res.status(400).json({ message: "You can't follow yourself!" });

  const userToFollow = await User.findById(userId);
  if (!userToFollow)
    return res.status(404).json({ message: "User not found!" });

  const currentUser = await User.findById(currentUserId);
  if (!currentUser) return res.status(404).json({ message: "User not found!" });

  if (userToFollow.isPrivate) {
    //  Logic for Private Account
    if (userToFollow.followRequests.includes(currentUserId)) {
      return res.status(400).json({ message: "Follow request already sent!" });
    } else {
      userToFollow.followRequests.push(currentUserId);
      await userToFollow.save();
      return res.json({ message: "Follow request sent." });
    }
  } else {
    // Logic for Public Account
    if (userToFollow.followers.includes(currentUserId)) {
      return res.status(400).json({ message: "Already following the user!" });
    } else {
      userToFollow.followers.push(currentUserId);
      currentUser.following.push(userId);
      await userToFollow.save();
      await currentUser.save();
      return res.json({ message: "User followed successfully." });
    }
  }
});

router.post("/reject-request/:requesterId", auth, async (req, res) => {
  const requesterId = req.params.requesterId;
  const currentUserId = req.user._id;

  if (requesterId === currentUserId)
    return res.status(400).json({ message: "You can't follow yourself!" });

  const requesterUser = await User.findById(requesterId);
  if (!requesterUser)
    return res.status(404).json({ message: "User not found!" });

  const currentUser = await User.findById(currentUserId);
  if (!currentUser) return res.status(404).json({ message: "User not found!" });

  if (!currentUser.followRequests.includes(requesterId)) {
    return res.status(400).json({ message: "No follow request found!" });
  }

  const updatedRequests = currentUser.followRequests.filter(
    (id) => id.toString() !== requesterId
  );
  currentUser.followRequests = updatedRequests;
  await currentUser.save();

  res.json({ message: "Follow request rejected" });
});

router.post("/accept-request/:requesterId", auth, async (req, res) => {
  const requesterId = req.params.requesterId;
  const currentUserId = req.user._id;

  if (requesterId === currentUserId)
    return res.status(400).json({ message: "You can't follow yourself!" });

  const requesterUser = await User.findById(requesterId);
  if (!requesterUser)
    return res.status(404).json({ message: "User not found!" });

  const currentUser = await User.findById(currentUserId);
  if (!currentUser) return res.status(404).json({ message: "User not found!" });

  if (!currentUser.followRequests.includes(requesterId)) {
    return res.status(400).json({ message: "No follow request found!" });
  }

  const updatedRequests = currentUser.followRequests.filter(
    (id) => id.toString() !== requesterId
  );
  currentUser.followRequests = updatedRequests;
  currentUser.followers.push(requesterId);
  requesterUser.following.push(currentUserId);
  await currentUser.save();
  await requesterUser.save();

  res.json({ message: "Follow request accepted" });
});

router.get("/:userId/followers", auth, async (req, res) => {
  const userId = req.params.userId;
  const currentUserId = req.user._id;

  const user = await User.findById(userId).populate(
    "followers",
    "_id username"
  );
  if (!user) return res.status(404).json({ message: "User not found!" });

  const currentUser = await User.findById(currentUserId);
  if (!currentUser) return res.status(404).json({ message: "User not found!" });

  if (currentUser.following.includes(userId) || !user.isPrivate) {
    return res.json(user.followers);
  } else {
    return res
      .status(400)
      .json({ message: "Can't get followers list - Account is private." });
  }
});

router.get("/:userId/following", auth, async (req, res) => {
  const userId = req.params.userId;
  const currentUserId = req.user._id;

  const user = await User.findById(userId).populate(
    "following",
    "_id username"
  );
  if (!user) return res.status(404).json({ message: "User not found!" });

  const currentUser = await User.findById(currentUserId);
  if (!currentUser) return res.status(404).json({ message: "User not found!" });

  if (currentUser.following.includes(userId) || !user.isPrivate) {
    return res.json(user.followers);
  } else {
    return res
      .status(400)
      .json({ message: "Can't get following list - Account is private." });
  }
});

router.post("/:userId/unfollow", auth, async (req, res) => {
  const userId = req.params.userId;
  const currentUserId = req.user._id;

  const userToUnfollow = await User.findById(userId);
  if (!userToUnfollow)
    return res.status(404).json({ message: "User not found!" });

  const currentUser = await User.findById(currentUserId);
  if (!currentUser) return res.status(404).json({ message: "User not found!" });

  if (!userToUnfollow.followers.includes(currentUserId)) {
    return res
      .status(400)
      .json({ message: "User is not available in the followers" });
  }

  userToUnfollow.followers = userToUnfollow.followers.filter(
    (id) => id.toString() !== currentUserId
  );
  currentUser.following = currentUser.following.filter(
    (id) => id.toString() !== userId
  );
  await userToUnfollow.save();
  await currentUser.save();

  res.json({ message: "User unfollowed successfully!" });
});

const generateToken = (data) => {
  return jwt.sign(data, process.env.JWT_KEY);
};

module.exports = router;
