const express = require("express");
const session = require("express-session");
const path = require("path");
const connectDB = require("./config/mongoose");
const userModel = require("./models/user");
const fileModel = require("./models/file");

const app = express();

app.set("view engine", "ejs");
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: "123456",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // true if using HTTPS
  })
);

connectDB();

// Middleware to check if user is authenticated
function isAuthenticated(req, res, next) {
  if (!req.session.userId) {
    return res.render("login", { error: "Please log in first." });
  }
  next();
}

app.get("/register", (req, res) => {
  res.render("register", { error: null });
});

app.post("/register", async (req, res) => {
  const { name, email, password, username } = req.body;

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

    const passwordRegex = btoa(password);

    const newUser = await userModel.create({
      username: username.toLowerCase(),
      name,
      email: email.toLowerCase(),
      password: passwordRegex,
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

    const originalPass = atob(user.password);

    if (originalPass !== password) {
      return res.render("login", { error: "Invalid password" });
    }

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
    res.redirect("/login");
  });
});

app.get("/", isAuthenticated, async (req, res) => {
  try {
    const userId = req.session.userId;

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

    const files = await fileModel.find({ owner: user._id });

    const fileExists = await Promise.all(
      files.map(async (file) => {
        return file.filename === req.body.filename;
      })
    );

    if (fileExists.includes(true)) {
      console.log("File already exists:", req.body.filename);
      return res.render("create", {
        error:
          "File with this name already exists. Please choose a different name.",
        filename: req.body.filename,
      });
    }

    const encryptedPassword = btoa(req.body.ePassword);

    const newFile = await fileModel.create({
      owner: user._id,
      filename: req.body.filename,
      title: req.body.title,
      content: req.body.text,
      isShareable: req.body.isShareable === "on" ? true : false,
      isEncrypted: req.body.isEncrypted === "on" ? true : false,
      createdAt: new Date().toISOString().slice(0, 10),
      ePassword: encryptedPassword || "",
    });

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
    const deleted = await fileModel.findOneAndDelete({
      owner: req.session.userId,
      filename: req.params.filename,
    });

    if (!deleted) return res.status(404).send("File not found");

    res.redirect("/");
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).send("Internal Server Error");
  }
});

app.post("/update/:filename", isAuthenticated, async (req, res) => {
  const { filedata, isShareable, isEncrypted, title, ePassword } = req.body; // Destructure to avoid unused variable warning
  const updatedPass = btoa(ePassword); // Encrypt the password if provided

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

    encryptedPassword = atob(file.ePassword); // Encrypt the password for comparison

    // Ensure session is properly set
    if (!userId) return res.redirect("/login");

    const filteredDate = req.session.filteredDate || null;
    const filteredSelect = req.session.filteredSelect || "all";

    const files = await fileModel.find({ owner: userId });
    if (!file) return res.status(404).send("File not found");
    if (file.isEncrypted && encryptedPassword !== password) {
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
  const newPassword = btoa(req.body.newPassword);

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
    res.redirect("/login");
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
