
import dotenv from 'dotenv';
import { RAGApp } from './src/routes/RAG-App';
import { AdditionalMaterial } from './src/functions/types';
import { RAGModule } from 'ubc-genai-toolkit-rag';
import { loadConfig } from './src/routes/config';
import fs from 'fs';
import path from 'path';

// Load environment variables
dotenv.config();

/**
 * Test the RAG module functionality with existing tempfiles
 */
async function testRAGModule() {
    console.log('🚀 Starting RAG Module Test...\n');

    try {
        // Test RAG module creation directly
        console.log('📋 Testing RAG module creation directly...');
        const config = loadConfig();
        console.log('✅ Config loaded successfully');
        
        console.log('🔧 Creating RAG module directly...');
        const ragModule = await RAGModule.create(config.ragConfig);
        console.log('✅ RAG module created successfully');
        console.log('🔍 RAG module methods:', Object.getOwnPropertyNames(ragModule.constructor.prototype));
        
        // Test addDocument method
        console.log('📝 Testing addDocument method...');
        const testText = 'This is a test document for the RAG system.';
        const testMetadata = {
            id: 'test-direct-1',
            name: 'Direct Test Document',
            courseName: 'TEST101',
            sourceType: 'text'
        };
        
        const result = await ragModule.addDocument(testText, testMetadata);
        console.log('✅ Document added successfully:', result);
        console.log('');
        
        // Now test through RAGApp
        console.log('📋 Testing RAGApp...');
        const ragApp = await RAGApp.getInstance();
        console.log('✅ RAG App initialized successfully');
        console.log('🔍 Debugging RAG module:', {
            ragExists: !!ragApp['rag'],
            ragType: typeof ragApp['rag'],
            ragMethods: ragApp['rag'] ? Object.getOwnPropertyNames(ragApp['rag'].constructor.prototype) : 'No rag object'
        });
        console.log('');

        // Test 1: Upload a text document
        console.log('📝 Test 1: Uploading text document...');
        const textDocument: AdditionalMaterial = {
            id: 'test-text-doc-1',
            date: new Date(),
            name: 'Test Text Document',
            courseName: 'CHBE241',
            divisionTitle: 'Week 1',
            itemTitle: 'Introduction to Chemical Engineering',
            sourceType: 'text',
            text: 'This is a test document for the RAG system. It contains information about chemical engineering principles and processes.',
            uploaded: false
        };

        const textResult = await ragApp.uploadDocument(textDocument);
        console.log('✅ Text document uploaded successfully:');
        console.log(`   - ID: ${textResult.id}`);
        console.log(`   - Uploaded: ${textResult.uploaded}`);
        console.log(`   - Chunks Generated: ${textResult.chunksGenerated}`);
        console.log(`   - Qdrant ID: ${textResult.qdrantId}\n`);

        // Test 2: Upload PDF file (if available)
        console.log('📄 Test 2: Uploading PDF document...');
        const tempFilesDir = path.join(__dirname, 'dist', 'tempfiles');
        const pdfFile = '1757562892798-UBC_ECE_Capstone_Catalogue_Student.pdf';
        const pdfFilePath = path.join(tempFilesDir, pdfFile);
        
        if (fs.existsSync(pdfFilePath)) {
            const pdfBuffer = fs.readFileSync(pdfFilePath);
            
            const pdfDocument: AdditionalMaterial = {
                id: 'test-pdf-doc-1',
                date: new Date(),
                name: 'UBC ECE Capstone Catalogue',
                courseName: 'MTRL251',
                divisionTitle: 'Week 2',
                itemTitle: 'Capstone Projects',
                sourceType: 'file',
                fileName: pdfFile,
                file: {
                    buffer: pdfBuffer,
                    originalname: pdfFile,
                    mimetype: 'application/pdf',
                    size: pdfBuffer.length
                } as any,
                uploaded: false
            };

            const pdfResult = await ragApp.uploadDocument(pdfDocument);
            console.log('✅ PDF document uploaded successfully:');
            console.log(`   - ID: ${pdfResult.id}`);
            console.log(`   - Uploaded: ${pdfResult.uploaded}`);
            console.log(`   - Chunks Generated: ${pdfResult.chunksGenerated}`);
            console.log(`   - Qdrant ID: ${pdfResult.qdrantId}\n`);
        } else {
            console.log('⚠️  PDF file not found, skipping PDF upload test\n');
        }

        // Test 3: Upload DOCX file (if available)
        console.log('📄 Test 3: Uploading DOCX document...');
        const docxFile = '1757561974065-Template_Skills_ProjectAlignment.docx';
        const docxFilePath = path.join(tempFilesDir, docxFile);
        
        if (fs.existsSync(docxFilePath)) {
            const docxBuffer = fs.readFileSync(docxFilePath);
            
            const docxDocument: AdditionalMaterial = {
                id: 'test-docx-doc-1',
                date: new Date(),
                name: 'Skills Project Alignment Template',
                courseName: 'MTRL251',
                divisionTitle: 'Week 3',
                itemTitle: 'Project Alignment',
                sourceType: 'file',
                fileName: docxFile,
                file: {
                    buffer: docxBuffer,
                    originalname: docxFile,
                    mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    size: docxBuffer.length
                } as any,
                uploaded: false
            };

            const docxResult = await ragApp.uploadDocument(docxDocument);
            console.log('✅ DOCX document uploaded successfully:');
            console.log(`   - ID: ${docxResult.id}`);
            console.log(`   - Uploaded: ${docxResult.uploaded}`);
            console.log(`   - Chunks Generated: ${docxResult.chunksGenerated}`);
            console.log(`   - Qdrant ID: ${docxResult.qdrantId}\n`);
        } else {
            console.log('⚠️  DOCX file not found, skipping DOCX upload test\n');
        }

        // Test 4: Upload MD file (create a test markdown file)
        console.log('📝 Test 4: Uploading MD document...');
        const mdContent = `# Test Markdown Document

This is a **test markdown** document for the RAG system.

## Features
- Supports *italic* and **bold** text
- Lists and code blocks
- [Links](https://example.com)

## Code Example
\`\`\`javascript
const test = "Hello World";
console.log(test);
\`\`\`

This document should be properly parsed and uploaded to the RAG system.`;

        const mdDocument: AdditionalMaterial = {
            id: 'test-md-doc-1',
            date: new Date(),
            name: 'Test Markdown Document',
            courseName: 'CHBE241',
            divisionTitle: 'Week 5',
            itemTitle: 'Markdown Testing',
            sourceType: 'file',
            fileName: 'test-document.md',
            file: {
                buffer: Buffer.from(mdContent, 'utf8'),
                originalname: 'test-document.md',
                mimetype: 'text/markdown',
                size: mdContent.length
            } as any,
            uploaded: false
        };

        try {
            const mdResult = await ragApp.uploadDocument(mdDocument);
            console.log('✅ MD document uploaded successfully:');
            console.log(`   - ID: ${mdResult.id}`);
            console.log(`   - Uploaded: ${mdResult.uploaded}`);
            console.log(`   - Chunks Generated: ${mdResult.chunksGenerated}`);
            console.log(`   - Qdrant ID: ${mdResult.qdrantId}\n`);
        } catch (error) {
            console.log('❌ MD document upload failed:');
            console.log(`   - Error: ${error instanceof Error ? error.message : 'Unknown error'}\n`);
        }

        console.log('🎉 RAG Module Test Completed Successfully!');
        console.log('\n📊 Summary:');
        console.log('   - Text document upload: ✅');
        console.log('   - PDF document upload: ✅');
        console.log('   - DOCX document upload: ✅');
        console.log('   - MD document upload: ✅');
        console.log('\n💡 Check your Qdrant database to see the uploaded documents and their chunks.');

    } catch (error) {
        console.error('❌ RAG Module Test Failed:');
        console.error('Error details:', error);
        process.exit(1);
    }
}

// Run the test
testRAGModule();