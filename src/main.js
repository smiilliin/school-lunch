const { IgApiClient } = require("instagram-private-api");
const dotenv = require("dotenv");
const fs = require("fs");
const PImage = require("pureimage");
const { Writable } = require("stream");

dotenv.config();

const writeImage = (title, content, date) => {
  return new Promise((resolve) => {
    const image = PImage.make(1080, 1080);

    const ctx = image.getContext("2d");

    ctx.fillStyle = "#1A1C1D";
    ctx.fillRect(0, 0, 1080, 1080);

    const font = PImage.registerFont("NotoSansKR-Regular.ttf", "Noto Sans KR");

    font.loadSync();

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "48pt 'Noto Sans KR'";
    const drawText = (text, x, y) => {
      const lineHeight = 60;
      text.split("\n").forEach((t, i) => {
        ctx.fillText(t, x, y + lineHeight * i);
      });
    };
    drawText(title, 32, 120);
    drawText(content, 32, 240);
    drawText(date, 32, 1080 - 48);

    const buffers = [];
    const stream = new Writable();
    stream._write = (chunk, _, callback) => {
      buffers.push(chunk);
      callback();
    };
    stream.on("finish", () => {
      resolve(Buffer.concat(buffers));
    });

    PImage.encodeJPEGToStream(image, stream);
  });
};
const intervalCallback = () => {
  const date = new Date();
  const dateString = `${date.getFullYear()}.${date.getMonth() + 1}.${(
    "00" + date.getDate()
  ).slice(-2)}`;

  if (fs.existsSync("last.txt")) {
    const lastDate = fs.readFileSync("last.txt").toString();

    if (lastDate == dateString) return;
  }

  fs.writeFileSync("last.txt", dateString);

  console.log("try upload");
  fetch(
    `https://school.iamservice.net/api/article/organization/${process.env.SCHOOL_ID}?next_token=0`
  )
    .then((data) => data.json())
    .then(async (data) => {
      const filteredArticles = data.articles.filter(
        (article) => article.local_date_of_pub_date == dateString
      );
      if (filteredArticles.length == 0) {
        console.log("today lunch is undefined");
        return;
      }
      const authors = ["조식", "중식", "석식"];

      const orderedArticles = filteredArticles.sort(
        (a, b) => authors.indexOf(a.author) - authors.indexOf(b.author)
      );
      const simplicatedArticles = orderedArticles.map((x) => {
        return {
          title: x.title,
          content: x.content,
          date: dateString,
        };
      });

      const ig = new IgApiClient();
      ig.state.generateDevice(process.env.ID);

      await ig.account.login(process.env.ID, process.env.PASSWORD);

      const items = await Promise.all(
        simplicatedArticles.map(async (x) => {
          return {
            file: await writeImage(x.title, x.content, x.date),
          };
        })
      );

      const publishResult = await ig.publish.album({
        items: items,
        caption: `급식(${dateString})`,
      });

      console.log(publishResult);
    })
    .catch((err) => console.error(err));
};

intervalCallback();

setInterval(intervalCallback, 1000 * 60 * 60);
