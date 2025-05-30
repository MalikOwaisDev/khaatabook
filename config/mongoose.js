const mongoose = require("mongoose");

const connectDB = async () => {
  await mongoose.connect(
    "mongodb+srv://Owais:AqrVmo4J7FG2G6xM@cluster0.52oa0oc.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0",
    {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  );
  console.log("DataBase Connected Succesfully");
};

// db.on("open", () => {
//   console.log("Connected to MongoDB successfully");
// });

// db.on("error", console.error.bind(console, "MongoDB connection error:"));

module.exports = connectDB;
