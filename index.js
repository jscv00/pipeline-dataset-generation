import inquirer from "inquirer";
import fs from "fs-extra";
import path from "path";
import ffmpeg from "fluent-ffmpeg";

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
  const { lightLevel } = await inquirer.prompt([
    {
      type: "list",
      name: "lightLevel",
      message: "Select lighting condition for this clip:",
      choices: ["low", "medium", "high"],
    },
  ]);

  // Build and create directories
  const rootDir = "Pile of food dataset";
  const intervalDir = `${interval.trim()}Interval`;
  const subDirName = subInterval.trim().replace(".", "_") + "Pounds";
  const lightDirName = `${lightLevel.charAt(0).toUpperCase()}${lightLevel.slice(1)}Light`;
  const targetDir = path.join(rootDir, intervalDir, subDirName, lightDirName);

  await fs.ensureDir(targetDir);
  console.log(`✔ Created directory: ${targetDir}`);

  // 4. Extract frames
  console.log(`Extracting frames…`);
  await new Promise((resolve, reject) => {
    ffmpeg(videoFile)
      .output(path.join(targetDir, "frameJoe_%04d.jpg"))
      .fps(2)
      .on("end", () => {
        console.log("✔ Extraction complete!");
        resolve();
      })
      .on("error", (err) => {
        console.error("✖ Extraction error:", err.message);
        reject(err);
      })
      .run();
  });

  // --- manifest generation ---
  const manifestPath = path.join(rootDir, "manifest.csv");
  const headerLine = "image_path,interval,subinterval,light\n";

  // 1. Create manifest with header if needed
  if (!(await fs.pathExists(manifestPath))) {
    await fs.writeFile(manifestPath, headerLine);
  }

  // 2. Read all frames in the light-level folder
  const frames = await fs.readdir(targetDir);
  const relDir = path.relative(rootDir, targetDir).split(path.sep).join("/");

  // 3. Build CSV lines for each image
  const csvLines = frames
    .filter((f) => f.toLowerCase().endsWith(".jpg"))
    .map((f) => {
      const imagePath = `${relDir}/${f}`; // e.g. "1-2Interval/1_3Pounds/MediumLight/frame_0001.jpg"
      return `${imagePath},${interval.trim()},${subInterval.trim()},${lightLevel.toLowerCase()}`;
    });

  // 4. Append to manifest
  await fs.appendFile(manifestPath, csvLines.join("\n") + "\n");
  console.log(`✔ Appended ${csvLines.length} entries to manifest.csv`);

  console.log("All done!");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
