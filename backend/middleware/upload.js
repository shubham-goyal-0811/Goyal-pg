const multer = require('multer');

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/') || file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only images and PDFs are allowed.'), false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 8 * 1024 * 1024 // 8 MB limit
  },
  fileFilter
});

module.exports = upload;
