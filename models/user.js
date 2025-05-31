const mongoose = require("mongoose");

let userSchema = mongoose.Schema({
  username: String,
  name: String,
  email: String,
  password: String,
});

let userModel = mongoose.model("user", userSchema);
module.exports = userModel;
