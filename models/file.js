const mongoose = require("mongoose");

const fileScehma = mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  filename: String,
  title: String,
  content: String,
  isShareable: { type: Boolean, default: false },
  isEncrypted: { type: Boolean, default: false },
  ePassword: String,
  createdAt: String,
});

let fileModel = mongoose.model("file", fileScehma);

module.exports = fileModel;
