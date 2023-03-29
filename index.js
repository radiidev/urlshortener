require("dotenv").config();
const express = require("express");
const cors = require("cors");
const app = express();
const mongoose = require("mongoose");
const dns = require("dns");

// Basic Configuration
const port = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || "";

mongoose.connect(MONGODB_URI, {
  // @ts-ignore
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const urlSchema = new mongoose.Schema({
  original: {
    type: String,
    unique: true,
  },
  short: { type: Number, unique: true },
});

const Url = mongoose.model("Url", urlSchema);

const counterSchema = new mongoose.Schema({
  name: { type: String, unique: true },
  seq: { type: Number, default: 0 },
});

const Counter = mongoose.model("Counter", counterSchema);

let shortUrlsCounterSet = false;
let shortUrlsCounter = 0;
Counter.findOne({ name: "shortUrl" })
  .then((counter) => {
    if (counter) {
      console.log(`Old counter: ${counter}`);
      shortUrlsCounter = counter.seq;
      shortUrlsCounterSet = true;
    } else {
      const shortUrlsCounterModel = new Counter({ name: "shortUrl" });
      shortUrlsCounterModel
        .save()
        .then((counter) => {
          if (counter) {
            console.log(`New counter: ${counter}`);
            shortUrlsCounter = counter.seq;
            shortUrlsCounterSet = true;
          } else {
            console.log(`Error: could not create a new counter`);
          }
        })
        .catch((err) => console.log(err));
    }
  })
  .catch((err) => console.log(err));

app.use(cors());

app.use("/public", express.static(`${process.cwd()}/public`));

app.get("/", function (req, res) {
  res.sendFile(process.cwd() + "/views/index.html");
});

app.use(express.urlencoded({ extended: false }));

// Your first API endpoint
app.post("/api/shorturl/", (req, res) => {
  if (!shortUrlsCounterSet) {
    res.status(503);
    return res.send(
      "Sorry, this API endpoint is not yet ready to handle requests!"
    );
  }
  const original = req.body.url;
  try {
    const hostname = new URL(original).hostname;
    dns.lookup(hostname, (err, addr, family) => {
      if (err) {
        console.log(`Invalid url:\n${err}`);
        res.json({ error: "Invalid URL" });
      } else {
        Url.findOne({ original: original })
          .then((url) => {
            if (url)
              return res.json({
                original_url: original,
                short_url: url?.short,
              });
            const urlModel = new Url({
              original: original,
              short: shortUrlsCounter++,
            });
            Counter.findOneAndUpdate(
              { name: "shortUrl" },
              { $set: { seq: shortUrlsCounter } },
              { new: true }
            )
              .then((counter) => {
                if (counter)
                  console.log(`${counter?.name} updated to ${counter?.seq}`);
                else {
                  console.log(`Could not find "shortUrl" counter in DB`);
                  return res.sendStatus(500);
                }
              })
              .catch((err) => {
                console.log(`Error updating shortUrl counter in DB:\n${err}`);
                return res.sendStatus(500);
              });
            urlModel
              .save()
              .then((url) => {
                if (url)
                  return res.json({
                    original_url: original,
                    short_url: url?.short,
                  });
                console.log(`Unlikely scenario occurred!:\n${url}`);
                res.sendStatus(500);
              })
              .catch((err) => {
                console.log(`Inserting url to DB failed!:\n${err}`);
                res.sendStatus(500);
              });
          })
          .catch((err) => {
            console.log(`Query failed!:\n${err}`);
            res.sendStatus(500);
          });
      }
    });
  } catch (err) {
    res.json({ error: "Invalid URL" });
  }
});

app.get("/api/shorturl/:shorturl", (req, res) => {
  const shorturl = Number(req.params.shorturl);
  Url.findOne({ short: shorturl })
    .then((url) => res.redirect(url.original))
    .catch((err) =>
      res.json({ error: "No short URL found for the given input" })
    );
});

app.listen(port, function () {
  console.log(`Listening on port ${port}`);
});
