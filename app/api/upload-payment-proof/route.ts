import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';

export async function POST(req: Request) {
  try {
    const data = await req.formData();
    const file: File | null = data.get('file') as unknown as File;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Upload directory path
    const uploadDir = path.join(process.cwd(), 'public/uploads');

    // Agar uploads folder maujood nahi hai, toh code khud bana dega!
    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    // Unique filename generate karein
    const filename = `${Date.now()}-${file.name.replace(/\s/g, '_')}`;
    const filePath = path.join(uploadDir, filename);
    
    await writeFile(filePath, buffer);

    const fileUrl = `/uploads/${filename}`;

    return NextResponse.json({ success: true, fileUrl });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Upload failed' }, { status: 500 });
  }
}