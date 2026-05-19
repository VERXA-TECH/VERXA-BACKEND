import { DocsRepository, type Document } from "../../repository/document";
import storageService from "../../services/storage/storage.service";

export default class DocumentHelper {
    private static documentRepo = new DocsRepository();

    /**
     * update the last accessed timestamp
     */

    static async updateLastAccessed(documentId: string): Promise<void> {
        await this.documentRepo.updateLastAccessed(documentId);
    }

    /**
     * format resp
     */

    static formatDocumentResponse(document: Document) {
        return {
            id: document.id,
            fileKey: document.fileKey,
            originalName: document.originalName,
            url: document.storageUrl || storageService.getPublicUrl(document.fileKey),
            size: document.size,
            contentType: document.contentType,
            documentType: document.documentType,
            uploadDate: document.uploadDate,
            lastAccessed: document.lastAccessed,
            metadata: document.metadata
        };
    }

    /**
     * format document list resp
     */

    static formatDocumentListResponse(documents: Document[]) {
        return documents.map((doc) => ({
            id: doc.id,
            fileKey: doc.fileKey,
            originalName: doc.originalName,
            size: doc.size,
            contentType: doc.contentType,
            documentType: doc.documentType,
            uploadDate: doc.uploadDate,
            lastAccessed: doc.lastAccessed,
            url: doc.storageUrl || storageService.getPublicUrl(doc.fileKey)
        }));
    }

    /**
     * format file size
     */

    static formatFileSize(bytes: number): string {
        if (bytes === 0) return "0 Bytes";
        const k = 1024;
        const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
    }
}
