import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const data = await req.formData();
    const file: File | null = data.get('file') as unknown as File;

    if (!file) {
      return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // File ko Base64 Data URL mein convert karlein (Vercel/Serverless ke liye best solution)
    const base64String = buffer.toString('base64');
    const fileUrl = `data:${file.type};base64,${base64String}`;

    return NextResponse.json({ success: true, fileUrl });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || 'Upload failed' }, { status: 500 });
  }
}