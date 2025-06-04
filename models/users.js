const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 40,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  password: { type: String, required: true },
  profileName: { type: String },
  bio: { type: String, maxlength: 150 },
  accountStatus: {
    type: String,
    enum: ["active", "disable", "banned"],
    default: "active",
  },
  isVerified: { type: Boolean, default: false },
  isPrivate: { type: Boolean, default: false },
  gender: {
    type: String,
    enum: ["male", "female", "non-binary", "prefer not to say"],
  },
  phoneNumber: { type: String, trim: true },
  resetToken: { type: String },
  resetTokenExpires: { type: Date },
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  followRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
});

const User = mongoose.model("User", userSchema);

module.exports = User;
