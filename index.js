const express = require("express");
const multer = require("multer");
const fs = require("fs-extra");
const { stat } = require("fs-extra");
const path = require("path");
const cors = require("cors");
const dotenv = require("dotenv");
const archiver = require("archiver");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const apiToken = process.env.API_SECRET_TOKEN;

const authenticateToken = (req, res, next) => {
  const token = req.headers["authorization"];
  if (token === `Bearer ${apiToken}`) {
    next();
  } else {
    res.status(401).json({ error: "Token inválido ou ausente." });
  }
};

const PORT = 3369;

const storage = multer.diskStorage({
  destination: async function (req, file, cb) {
    const { companyName, entity, entityId } = req.params;
    const year = new Date().getFullYear();
    const month = String(new Date().getMonth() + 1).padStart(2, "0");
    const uploadPath = path.join(
      __dirname,
      "uploads",
      companyName,
      entity,
      entityId,
      year.toString(),
      month
    );
    await fs.ensureDir(uploadPath);
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const extension = path.extname(file.originalname);
    cb(null, uniqueSuffix + extension);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /png|jpg|jpeg|svg|webp|pdf|jfif/;
  const mimeType = allowedTypes.test(file.mimetype);
  const extName = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  if (mimeType && extName) {
    cb(null, true);
  } else {
    cb(new Error("Tipo de arquivo inválido."), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // Limite de 5MB
});

app.post(
  "/upload/:companyName/:entity/:entityId",
  authenticateToken, // Middleware de autenticação aplicado apenas na rota de upload
  upload.single("image"),
  (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "Nenhuma imagem foi enviada." });
    }
    const { companyName, entity, entityId } = req.params;
    if (!entity || !entityId || !companyName) {
      return res.status(400).json({
        success: false,
        error: "Parametro ausente.",
      });
    }
    try {
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, "0");
      const imagePath = `/uploads/${companyName}/${entity}/${entityId}/${year}/${month}/${req.file.filename}`;
      res.status(200).json({
        success: true,
        message: "Upload realizado com sucesso!",
        imageUrl: imagePath,
      });
    } catch (err) {
      res.status(500).json({
        success: false,
        error: "Erro ao realizar o upload",
        details: err,
      });
    }
  }
);

app.get("/uploads/*", async (req, res) => {
  const filePath = path.join(__dirname, req.url);
  try {
    const stats = await stat(filePath);
    if (stats.isFile()) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ error: "Arquivo não encontrado." });
    }
  } catch (err) {
    res.status(500).json({ error: "Erro ao acessar o arquivo.", details: err });
  }
});

// Rota de backup para baixar todos os arquivos da pasta 'uploads' em um arquivo ZIP
app.get("/backup", (req, res) => {
  const output = fs.createWriteStream(path.join(__dirname, "backup.zip"));
  const archive = archiver("zip", {
    zlib: { level: 9 }, // Configurando a compactação
  });

  // Configurações de evento
  archive.on("error", (err) => {
    res.status(500).json({ error: "Erro ao criar backup", details: err });
  });

  // A cada arquivo da pasta 'uploads', ele será adicionado ao arquivo ZIP
  archive.directory(path.join(__dirname, "uploads"), false);

  // Finalizando e enviando o arquivo ZIP
  archive.pipe(output);
  archive.finalize();

  // Quando o arquivo ZIP estiver pronto, envie para o cliente
  output.on("close", () => {
    res.download(path.join(__dirname, "backup.zip"), "backup.zip", (err) => {
      if (err) {
        console.error("Erro ao enviar o arquivo", err);
      }
      // Apaga o arquivo ZIP temporário após o envio
      fs.remove(path.join(__dirname, "backup.zip"));
    });
  });
});

app.get("/", (req, res) => {
  res.status(200).json({ message: "API está funcionando!" });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
