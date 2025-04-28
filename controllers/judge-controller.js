const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const BASE_PATH =  "/app";

fs.mkdirSync(BASE_PATH, { recursive: true });

const cleanup = (files) => {
  files.forEach(file => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });
};

const getJavaClassName = (code) => {
  const match = code.match(/public\s+class\s+(\w+)/);
  return match ? match[1] : "Main";
};

const getDockerCommand = (language, timestamp, codeFile, inputFile, outputFile, execFile, javaClassName) => {
  const timeLog = `/app/time_${timestamp}.log`;

  switch (language) {
    case "python":
      return `timeout 3s docker run --rm --memory=256m --cpus=0.5 -v "${BASE_PATH}:/app" python:3.9 bash -c "/usr/bin/time -v python3 /app/${codeFile} < /app/${inputFile} > /app/${outputFile} 2> ${timeLog}"`;

    case "cpp":
      return `docker run --rm --memory=256m --cpus=0.5 -v "${BASE_PATH}:/app"  gcc:latest bash -c "g++ /app/${codeFile} -o /app/${execFile} && timeout 3s /usr/bin/time -v /app/${execFile} < /app/${inputFile} > /app/${outputFile} 2> ${timeLog}"`;

    case "java":
      return `timeout 3s docker run --rm --memory=256m --cpus=0.5 -v "${BASE_PATH}:/app" openjdk:17 bash -c "javac /app/${codeFile} && /usr/bin/time -v java -cp /app ${javaClassName} < /app/${inputFile} > /app/${outputFile} 2> ${timeLog}"`;

    default:
      return null;
  }
};

const runCode = async (req, res) => {
  const { language, code, input } = req.body;
  const timestamp = Date.now();

  const ext = language === "python" ? "py" : language === "cpp" ? "cpp" : "java";
  const javaClassName = language === "java" ? getJavaClassName(code) : null;
  const codeFile = language === "java" ? `${javaClassName}.java` : `code_${timestamp}.${ext}`;
  const execFile = `exec_${timestamp}`;
  const inputFile = `input_${timestamp}.txt`;
  const outputFile = `output_${timestamp}.txt`;

  const codePath = path.join(BASE_PATH ,codeFile);
  const inputPath = path.join(BASE_PATH, inputFile);
  const outputPath = path.join(BASE_PATH, outputFile);
  const timePath = path.join(BASE_PATH, `time_${timestamp}.log`);

  fs.writeFileSync(codePath, code);
  fs.writeFileSync(inputPath, input || '');

  const dockerCommand = getDockerCommand(language, timestamp, codeFile, inputFile, outputFile, execFile, javaClassName);
  if (!dockerCommand) return res.status(400).json({ error: "Unsupported language" });

  exec(dockerCommand, (error, stdout, stderr) => {
    if (error) {
      return res.status(500).json({ error: stderr || error.message });
    }

    const output = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf-8') : '';
    const timeLog = fs.existsSync(timePath) ? fs.readFileSync(timePath, 'utf-8') : '';

    const timeMatch = /Elapsed \(wall clock\) time \(h:mm:ss or m:ss\): (.*)/.exec(timeLog);
    const time = timeMatch ? timeMatch[1] : "Unknown";

    const memoryMatch = /Maximum resident set size \(kbytes\): (\d+)/.exec(timeLog);
    const memory = memoryMatch ? memoryMatch[1] : "Unknown";

    cleanup([codePath, inputPath, outputPath, timePath, path.join(BASE_PATH, execFile), path.join(BASE_PATH, `${execFile}.class`)]);

    res.json({ output, time, memory: `${memory} KB` });
  });
};

const submitCode = async (req, res) => {
  const { language, code, testCases } = req.body;
  const timestamp = Date.now();

  const ext = language === "python" ? "py" : language === "cpp" ? "cpp" : "java";
  const javaClassName = language === "java" ? getJavaClassName(code) : null;
  const codeFile = language === "java" ? `${javaClassName}.java` : `code_${timestamp}.${ext}`;
  const execFile = `exec_${timestamp}`;
  const codePath = path.join(BASE_PATH,codeFile);

  console.log(`code path : ${codePath}`)
  
  fs.writeFileSync(codePath, code);

  let results = [];
  let passed = 0, total = testCases.length, totalTime = 0, totalMem = 0;

  for (let i = 0; i < testCases.length; i++) {
    const input = testCases[i].input;
    const expected = testCases[i].output.trim();

    const inputFile = `input_${timestamp}_${i}.txt`;
    const outputFile = `output_${timestamp}_${i}.txt`;
    const timeFile = `time_${timestamp}_${i}.log`;

    const inputPath = path.join(BASE_PATH ,inputFile);
    const outputPath = path.join(BASE_PATH ,outputFile);
    const timePath = path.join(BASE_PATH , timeFile);

    fs.writeFileSync(inputPath, input);

    const dockerCommand = getDockerCommand(language, `${timestamp}_${i}`, codeFile, inputFile, outputFile, execFile, javaClassName);

    try {
      await new Promise((resolve, reject) => {
        exec(dockerCommand, (err, stdout, stderr) => {
          if (err) {
            reject({ err, stderr });
          } else {
            resolve();
          }
        });
      });

      const output = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf-8').trim() : '';
      const timeLog = fs.existsSync(timePath) ? fs.readFileSync(timePath, 'utf-8') : '';

      const timeMatch = /Elapsed \(wall clock\) time \(h:mm:ss or m:ss\): (.*)/.exec(timeLog);
      const timeStr = timeMatch ? timeMatch[1] : "0:0.000";
      const timeParts = timeStr.split(':').map(parseFloat);
      const time = (timeParts.length === 2) ? (timeParts[0] * 60 + timeParts[1]) : 0;

      const memoryMatch = /Maximum resident set size \(kbytes\): (\d+)/.exec(timeLog);
      const memory = memoryMatch ? parseInt(memoryMatch[1]) : 0;

      const result = {
        testCase: i + 1,
        input: input,
        expectedOutput: expected,
        actualOutput: output,
        passed: output === expected,
        status: output === expected ? "Accepted" : "Wrong Answer",
        time: time.toFixed(3),
        memory: memory
      };

      results.push(result);

      totalTime += time;
      totalMem += memory;
      if (output === expected) passed++;
    } catch (err) {
      const result = {
        testCase: i + 1,
        input: input,
        expectedOutput: expected,
        actualOutput: '',
        passed: false,
        status: "Error",
        time: "0.000",
        memory: 0,
        stderr: err.stderr || err.err?.message || 'Unknown error'
      };
      results.push(result);
    }

    // (Optional) Clean after each test case
    // cleanup([inputPath, outputPath, timePath]);
  }

  //Final cleanup
  //cleanup([codePath, path.join(BASE_PATH, execFile), path.join(BASE_PATH, `${execFile}.class`)]);

  const message = passed === total ? "All test cases passed ✅" : `${passed} out of ${total} test cases passed ❌`;

  return res.json({
    testCases: results,
    message: message,
    success: passed === total
  });
};

module.exports = { runCode, submitCode };
