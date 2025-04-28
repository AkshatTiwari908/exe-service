const express =require("express")
const { runCode, submitCode } = require("../controllers/judge-controller.js")
const router = express.Router()

router.post("/run", runCode)
router.post("/submit", submitCode)

module.exports = router
