const mongoose = require("mongoose");
const Joi = require("joi");
// const userModel = require("./user");

// const { username, name, email, password } = userModel;

const fileScehma = mongoose.Schema({
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "user", required: true },
  filename: String,
  title: String,
  content: String,
  isShareable: { type: Boolean, default: false },
  isEncrypted: { type: Boolean, default: false },
  ePassword: String,
  createdAt: String,
  users: { type: mongoose.Schema.Types.ObjectId, ref: "user" },
});

let validateFile = (data) => {
  let schema = Joi.object({
    filename: Joi.string().required().trim(),
    title: Joi.string().required().trim(),
    content: Joi.string().required().trim(),
    isShareable: Joi.boolean().required().default(false),
    isEncrypted: Joi.boolean().required().default(false),
  });

  let { error } = schema.validate(data);
  return error;
};

let fileModel = mongoose.model("file", fileScehma);

module.exports = { fileModel, validateFile };
