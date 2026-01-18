/*
  Warnings:

  - A unique constraint covering the columns `[filename]` on the table `Download` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Download_filename_key" ON "Download"("filename");
