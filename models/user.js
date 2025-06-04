const mongoose = require("mongoose");

const Joi = require("joi");

// let fileSchema = mongoose.Schema({
//   owner: {
//     type: mongoose.Schema.Types.ObjectId,
//     ref: "file",
//     required: true,
//   },
//   filename: String,
//   title: String,
//   content: String,
//   isShareable: { type: Boolean, default: false },
//   isEncrypted: { type: Boolean, default: false },
//   ePassword: String,
//   createdAt: String,
// });

let userSchema = mongoose.Schema({
  username: String,
  name: String,
  email: String,
  password: String,
  files: [{ type: mongoose.Schema.Types.ObjectId, ref: "file" }],
});

let validateModel = (data) => {
  let schema = Joi.object({
    username: Joi.string().required().trim(),
    name: Joi.string().required().trim(),
    email: Joi.string().email().required().trim(),
    password: Joi.string().required().trim(),
  });

  let { error } = schema.validate(data);

  return error;
};

let userModel = mongoose.model("user", userSchema);
module.exports = { userModel, validateModel };
