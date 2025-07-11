import inquirer from "inquirer";
import fs from "fs-extra";
import path from "path";
import ffmpeg from "fluent-ffmpeg";

const nameForImages = "Joe";

async function main() {
  console.log("Welcome to the food pile dataset pipeline");

  // Prompt for video file path
  const { videoPath } = await inquirer.prompt([
    {
      type: "input",
      name: "videoPath",
      message: "Enter path to the video file:",
      validate: async (input) => {
        const exists = await fs.pathExists(input.trim());
        return exists || "File not found. Please enter a valid path.";
      },
    },
  ]);
  // Normalize and store
  const videoFile = path.resolve(videoPath.trim());
  console.log(`Using video file: ${videoFile}`);

  // 2. Root directory
  //   const rootDir = path.resolve("Pile of food dataset");
  //   await fs.ensureDir(rootDir);
  //   console.log(`Dataset root directory: ${rootDir}`);

  // Prompt for the weight interval (e.g. "1-2")
  const { interval } = await inquirer.prompt([
    {
      type: "input",
      name: "interval",
      message: "Enter weight interval (e.g. 1-2):",
      validate: (input) =>
        /^\d+(\.\d+)?-\d+(\.\d+)?$/.test(input.trim()) ||
        "Please enter in format X-Y, e.g. 1-2 or 2.1-3.0",
    },
  ]);

  // Prompt for the sub-interval weight (e.g. "1.3" or "1.0")
  const { subInterval } = await inquirer.prompt([
    {
      type: "input",
      name: "subInterval",
      message: "Enter sub-interval weight (e.g. 1.3 or 1.0):",
      validate: (input) =>
        /^\d+(\.\d+)?$/.test(input.trim()) ||
        "Please enter a numeric weight, like 1.3",
    },
  ]);

  // Prompt for lighting condition
  // const { lightLevel } = await inquirer.prompt([
  //   {
  //     type: "list",
  //     name: "lightLevel",
  //     message: "Select lighting condition for this clip:",
  //     choices: ["low", "medium", "high"],
  //   },
  // ]);

  // Build and create directories
  const rootDir = "Pile of food dataset";
  const intervalDir = `${interval.trim()}Interval`;
  const subDirName = subInterval.trim().replace(".", "_") + "Pounds";
  // const lightDirName = `${lightLevel.charAt(0).toUpperCase()}${lightLevel.slice(1)}Light`;
  const targetDir = path.join(rootDir, intervalDir, subDirName);

  await fs.ensureDir(targetDir);
  console.log(`✔ Created directory: ${targetDir}`);

  // 4. Extract frames
  // --- before extraction: determine the next start number ---
  const files = await fs.readdir(targetDir);
  const regex = new RegExp(`^frame${nameForImages}_(\\d+)\\.jpg$`);
  let maxNum = 0;

  for (const f of files) {
    const m = f.match(regex);
    if (m) {
      const num = parseInt(m[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  const startNumber = maxNum + 1; // if no files, this is 1

  // --- then extract, telling ffmpeg where to start ---
  console.log(
    `Extracting frames at 1 fps from ${videoFile} into ${targetDir} (starting at frame_${String(startNumber).padStart(4, "0")}.jpg)...`
  );
  await new Promise((resolve, reject) => {
    ffmpeg(videoFile)
      .outputOptions(["-start_number", startNumber.toString()])
      .output(path.join(targetDir, `frame${nameForImages}_%04d.jpg`))
      .fps(1)
      .on("progress", (progress) => {
        process.stdout.write(`\rFrames: ${progress.frames + maxNum}`);
      })
      .on("end", () => {
        console.log("\n✔ Frame extraction complete!");
        resolve();
      })
      .on("error", (err) => {
        console.error("\n✖ Frame extraction failed:", err.message);
        reject(err);
      })
      .run();
  });

  // --- manifest generation ---
  // --- manifest generation for only new frames ---
  const manifestPath = path.join(rootDir, "manifest.csv");
  const headerLine = "image_path,interval,subinterval,light\n";

  // 1. Ensure manifest exists
  if (!(await fs.pathExists(manifestPath))) {
    await fs.writeFile(manifestPath, headerLine);
  }

  // 2. Read all files now in the target folder
  const allFiles = await fs.readdir(targetDir);

  // 3. Filter only files whose index > previous maxNum
  const newFiles = allFiles.filter((f) => {
    const m = f.match(regex);
    return m && parseInt(m[1], 10) > maxNum;
  });

  // 4. Build CSV lines for just those new files
  const relDir = path.relative(rootDir, targetDir).split(path.sep).join("/");
  const csvLines = newFiles.map((f) => {
    const imagePath = `${relDir}/${f}`;
    return `${imagePath},${interval.trim()},${subInterval.trim()}`;
  });

  // 5. Append them
  if (csvLines.length) {
    await fs.appendFile(manifestPath, csvLines.join("\n") + "\n");
    console.log(`✔ Appended ${csvLines.length} new entries to manifest.csv`);
  } else {
    console.log("ℹ️  No new frames to append.");
  }

  console.log("All done!");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
