CREATE DATABASE IF NOT EXISTS docunest CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE docunest;

CREATE TABLE IF NOT EXISTS users (
  user_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(30) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user'
);

CREATE TABLE IF NOT EXISTS categories (
  category_id INT AUTO_INCREMENT PRIMARY KEY,
  category_name VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS documents (
  document_id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  category_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(255) NOT NULL,
  upload_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) NOT NULL DEFAULT 'Active',
  CONSTRAINT fk_documents_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  CONSTRAINT fk_documents_category FOREIGN KEY (category_id) REFERENCES categories(category_id) ON DELETE RESTRICT,
  INDEX idx_documents_title (title),
  INDEX idx_documents_upload_date (upload_date)
);

CREATE TABLE IF NOT EXISTS document_access (
  access_id INT AUTO_INCREMENT PRIMARY KEY,
  document_id INT NOT NULL,
  user_id INT NOT NULL,
  permission VARCHAR(20) NOT NULL DEFAULT 'view',
  granted_date DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_access_document FOREIGN KEY (document_id) REFERENCES documents(document_id) ON DELETE CASCADE,
  CONSTRAINT fk_access_user FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
  UNIQUE KEY unique_document_user (document_id, user_id)
);

INSERT IGNORE INTO categories (category_name, description) VALUES
('Reports','Project reports, summaries and research'),
('Projects','Project files, designs and deliverables'),
('Personal','Personal and private documents'),
('Study Materials','Notes, assignments and learning resources'),
('Others','Documents that do not fit other categories');
