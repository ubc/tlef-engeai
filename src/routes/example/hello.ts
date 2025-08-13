import express, { Request, Response } from 'express';
const router = express.Router();

router.get('/hello', (req: any, res: any) => {
  res.json({ message: 'Hello from the server!' });
});

export default router;
