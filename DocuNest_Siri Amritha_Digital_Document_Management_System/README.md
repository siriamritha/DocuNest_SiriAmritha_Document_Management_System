# Siri Amritha's DocuNest

Digital Document Management System built with HTML, CSS, JavaScript, Node.js, Express and MySQL.

## About the Project

DocuNest is a digital document management platform designed to simplify document storage, organization, sharing, and access management.

## Features

- Upload and manage documents.
- Download stored documents.
- Share documents with other users.
- Manage document access and permissions.
- Revoke document-sharing access.
- Delete documents securely.
- User authentication.

## Technologies Used

- **Frontend:** HTML, CSS, JavaScript
- **Backend:** Node.js, Express.js
- **Database:** MySQL
- **Authentication:** bcryptjs, Express Session
- **File Upload:** Multer

## Start the Project

1. Install Node.js and MySQL.
2. Open the extracted project folder containing `app.js` and `package.json`.
3. In MySQL Workbench, open `schema.sql` and execute it to create the database and tables.
4. Configure your local `.env` file with your MySQL credentials. Never share this file publicly.
5. Open CMD in the project folder and run:

```bash
npm install
node app.js
```

6. Open the localhost URL printed in the terminal.

## Port Configuration

The application uses the port configured in `app.js`. Check the terminal for the actual localhost URL when starting the server.

## Project Structure

```text
DocuNest/
├── app.js
├── package.json
├── package-lock.json
├── schema.sql
├── public/
├── uploads/
├── .env.example
├── .gitignore
└── README.md
```

## Important Notes

- The first registered account is assigned the administrator role.
- Uploaded documents are stored in the `uploads/` directory.
- The `.env` file contains private database settings and must not be uploaded to GitHub.

## Author

**Siri Amritha**

Academic Project – Digital Document Management System.
