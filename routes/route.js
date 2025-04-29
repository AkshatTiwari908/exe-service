const express =require("express")
const {  submitCode } = require("../controllers/judge-controller.js")
const router = express.Router()


router.post("/submit", submitCode)

module.exports = router
