const express = require("express");
const session = require("express-session");
const path = require("path");
const connectDB = require("./config/mongoose");
const { userModel, validateModel } = require("./models/user");
const { fileModel, validateFile } = require("./models/file");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { sanitizeFilter } = require("mongoose");
const passport = require("passport");
require("./config/googleStrategy");

const app = express();

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

app.use(
  session({
    secret: "123456",
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

require("dotenv").config();
connectDB();

const generateToken = (data) => {
  return jwt.sign(data, process.env.JWT_SECRET);
};

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (!req.cookies.token) {
    return res.render("login", { error: "Please login to continue" });
  }
  try {
    const decoded = jwt.verify(req.cookies.token, process.env.JWT_SECRET);
    req.session.userId = decoded.id; // Store user ID in session
  } catch (err) {
    console.error("Token verification error:", err);
    return res.render("login", { error: "Invalid token. Please login again." });
  }
  next();
}

app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", async (req, res) => {
  const { name, email, password, username } = req.body;
  let error = validateModel({ name, email, password, username });
  if (error) return res.render("register", { error: error.message });

  try {
    const existingUser = await userModel.findOne({
      $or: [{ email }, { name }],
    });

    if (existingUser) {
      const message =
        existingUser.email === email
          ? "Email already registered"
          : "Username already taken";
      return res.render("register", { error: message });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordRegex = await bcrypt.hash(password, salt);

    const newUser = await userModel.create({
      username: username.toLowerCase(),
      name,
      email: email.toLowerCase(),
      password: passwordRegex,
    });

    let token = generateToken({ email: newUser.email, id: newUser._id });

    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 1 day
    });
    req.session.userId = newUser._id;
    res.redirect("/");
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/login", (req, res) => {
  res.render("login", { error: null });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await userModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.render("login", { error: "Invalid email" });
    }

    const originalPass = await bcrypt.compare(password, user.password);

    if (originalPass === false) {
      return res.render("login", { error: "Invalid password" });
    }

    let token = generateToken({ email: user.email, id: user._id });

    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 1 day
    });

    req.session.userId = user._id;
    res.redirect("/");
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).send("Logout failed");
    }
    res.clearCookie("connect.sid");
    res.clearCookie("token");
    res.redirect("/login");
  });
});

app.get("/", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;

    const user = await userModel.findById(userId).populate("files");
    console.log(user);

    // Ensure session is properly set
    if (!userId) return res.redirect("/login");

    let files = await fileModel.find({ owner: userId });

    const filteredDate = req.session.filteredDate || null;
    const filteredSelect = req.session.filteredSelect || "all";

    // Filter files based on the selected filter
    if (filteredSelect === "new") {
      files = files.sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
      );
    } else if (filteredSelect === "old") {
      files = files.sort(
        (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
      );
    }

    if (filteredDate) {
      const date = new Date(filteredDate);
      files = files.filter(
        (file) =>
          new Date(file.createdAt).toDateString() === date.toDateString()
      );
    }

    res.render("index", {
      files,
      error: "",
      filterDate: filteredDate,
      filterSelect: filteredSelect,
    });
  } catch (err) {
    console.error("Error fetching files:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/create", isAuthenticated, (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const currentDate = `${today}.txt`;
  res.render("create", { filename: currentDate, error: "" });
});

app.post("/create", isAuthenticated, async (req, res) => {
  try {
    const user = await userModel.findById(req.session.userId);

    if (!user) return res.status(404).send("User not found");

    console.log(user);

    const files = await fileModel.find({ owner: user._id });

    const { filename, title, text, isShareable, isEncrypted, ePassword } =
      req.body;

    let error = validateFile({
      filename,
      title,
      content: text,
      isShareable: isShareable === "on" ? true : false,
      isEncrypted: isEncrypted === "on" ? true : false,
    });

    if (error)
      return res.render("create", {
        error: error.message,
        filename,
        title,
        text,
        isShareable,
        isEncrypted,
      });

    const fileExists = await Promise.all(
      files.map(async (file) => {
        return file.filename === filename;
      })
    );

    if (fileExists.includes(true)) {
      console.log("File already exists:", filename);
      return res.render("create", {
        error:
          "File with this name already exists. Please choose a different name.",
        filename: filename,
      });
    }

    const salt = await bcrypt.genSalt(10);
    const encryptedPassword = await bcrypt.hash(ePassword, salt);

    const newFile = await fileModel.create({
      owner: user._id,
      filename: filename,
      title: title,
      content: text,
      isShareable: isShareable === "on" ? true : false,
      isEncrypted: isEncrypted === "on" ? true : false,
      createdAt: new Date().toISOString().slice(0, 10),
      ePassword: encryptedPassword || "",
      users: user._id,
    });

    await user.files.push(newFile._id);
    await user.save();

    console.log("New file created:", newFile);
    res.redirect("/");
  } catch (err) {
    console.error("File creation error:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/edit/:filename", isAuthenticated, async (req, res) => {
  try {
    const file = await fileModel.findOne({
      owner: req.session.userId,
      filename: req.params.filename,
    });

    if (!file) return res.status(404).send("File not found");

    res.render("edit", {
      data: file.content,
      filename: file.filename,
      isShareable: file.isShareable,
      isEncrypted: file.isEncrypted,
      title: file.title,
      createdAt: file.createdAt,
      ePassword: file.ePassword || "",
    });
  } catch (err) {
    console.error("Edit error:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/view/:filename", isAuthenticated, async (req, res) => {
  try {
    const file = await fileModel.findOne({
      owner: req.session.userId,
      filename: req.params.filename,
    });

    if (!file) return res.status(404).send("File not found");

    res.render("view", {
      data: file.content,
      filename: file.filename,
      title: file.title,
      isShareable: file.isShareable,
      isEncrypted: file.isEncrypted,
      createdAt: file.createdAt,
    });
  } catch (err) {
    console.error("View error:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.get("/delete/:filename", isAuthenticated, async (req, res) => {
  try {
    const user = await userModel.findOne({ _id: req.session.userId });
    const deleted = await fileModel.findOneAndDelete({
      owner: req.session.userId,
      filename: req.params.filename,
    });

    user.files = user.files.filter(
      (fileId) => fileId.toString() !== deleted._id.toString()
    );
    await user.save();

    if (!deleted) return res.status(404).send("File not found");

    res.redirect("/");
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/update/:filename", isAuthenticated, async (req, res) => {
  const { filedata, isShareable, isEncrypted, title, ePassword } = req.body; // Destructure to avoid unused variable warning
  const salt = await bcrypt.genSalt(10);
  const updatedPass = await bcrypt.hash(ePassword, salt); // Encrypt the password if provided

  try {
    const updated = await fileModel.findOneAndUpdate(
      {
        owner: req.session.userId,
        filename: req.params.filename,
      },
      {
        content: filedata,
        isShareable: isShareable === "on" ? true : false,
        isEncrypted: isEncrypted === "on" ? true : false,
        title: title,
        ePassword: updatedPass || "",
      }
    );

    if (!updated) return res.status(404).send("File not found");

    res.redirect("/");
  } catch (err) {
    console.error("Update error:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/fileCheck/:filename", isAuthenticated, async (req, res) => {
  try {
    const password = req.body.ePassword;
    const filename = req.params.filename;
    const userId = req.session.userId;
    const file = await fileModel.findOne({
      owner: userId,
      filename: filename,
    });

    const encryptedPassword = await bcrypt.compare(password, file.ePassword); // Encrypt the password for comparison

    // Ensure session is properly set
    if (!userId) return res.redirect("/login");

    const filteredDate = req.session.filteredDate || null;
    const filteredSelect = req.session.filteredSelect || "all";

    const files = await fileModel.find({ owner: userId });
    if (!file) return res.status(404).send("File not found");
    if (file.isEncrypted && encryptedPassword === false) {
      return res.render("index", {
        files,
        error: "Invalid Password",
        filename: filename,
        filterDate: filteredDate,
        filterSelect: filteredSelect,
      });
    }
    // If password is correct or file is not encrypted, redirect to view
    res.redirect(`/view/${filename}`);
  } catch (err) {
    console.error("File update error:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/filter", (req, res, next) => {
  req.session.filteredDate = req.body.filterDate;
  req.session.filteredSelect = req.body.filterSelect;
  res.redirect("/");
});

app.get("/forget", (req, res, next) => {
  res.render("forgot", { error: null });
});

app.post("/forget", async (req, res, next) => {
  const { email, username } = req.body;

  if (!email && !username) {
    return res.render("forgot", { error: "Email or Username is required." });
  }
  if (email) {
    const user = await userModel.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.render("forgot", { error: "Email not registered." });
    }
    req.session.userId = user._id; // Set session userId for password reset
    return res.redirect("/reset");
  }
  if (username) {
    const user = await userModel.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.render("forgot", { error: "Username not registered." });
    }
    req.session.userId = user._id; // Set session userId for password reset
    return res.redirect("/reset");
  }
});

app.get("/reset", (req, res) => {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  res.render("reset", { error: null });
});

app.post("/reset", async (req, res) => {
  const password = req.body.newPassword;
  const salt = await bcrypt.genSalt(10);
  const newPassword = await bcrypt.hash(password, salt);

  if (!req.session.userId) {
    return res.redirect("/login");
  }
  const user = await userModel.findById(req.session.userId);

  if (!user) {
    return res.status(404).send("User not found");
  }
  user.password = newPassword;
  await user.save();
  req.session.destroy((err) => {
    if (err) {
      console.error("Session destruction error:", err);
      return res.status(500).send("Internal Server Error");
    }
    res.clearCookie("connect.sid");
    res.clearCookie("token");
    res.redirect("/login");
  });
});

// Route for starting the OAuth flow
app.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"] })
);

// Route for handling the callback from Google
app.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  async (req, res) => {
    try {
      const user = req.user;
      if (!user) throw new Error("User not found after authentication");

      const name = user.displayName || "GoogleUser";
      const username = name.replace(/\s+/g, "");
      const email = user.emails?.[0]?.value;

      if (!email) throw new Error("Email not received from Google");

      let userFind = await userModel.findOne({ email: email.toLowerCase() });

      if (!userFind) {
        userFind = await userModel.create({
          username: username.toLowerCase(),
          name,
          email: email.toLowerCase(),
        });
      }

      const token = generateToken({ email: userFind.email, id: userFind._id });

      res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });

      req.session.userId = userFind._id;
      res.redirect("/");
    } catch (err) {
      console.error("OAuth callback error:", err.message);
      res.status(500).send("Internal Server Error");
    }
  }
);

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
