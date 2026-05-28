require('dotenv').config();
const express = require('express');
const cors = require('cors');
const swaggerJsDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

// Routes
const authRoutes = require('./routes/auth');
const requestsRoutes = require('./routes/requests');
const mapLocationsRoutes = require('./routes/map-locations');
const usersRoutes = require('./routes/users');
const medicalRecordsRoutes = require('./routes/medical-records');
const servicesRoutes = require('./routes/services');
const chatRoutes = require('./routes/chat');

const app = express();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));app.use(express.json());

// Swagger
const swaggerOptions = {
    swaggerDefinition: {
        openapi: '3.0.0',
        info: {
            title: 'API مشروع تخرج رعاية المسنين',
            version: '1.0.0',
            description: 'توثيق الـ Endpoints',
        },
        components: {
            securitySchemes: {
                bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }
            }
        },
    },
    apis: [`${__dirname}/routes/*.js`],
};
const swaggerDocs = swaggerJsDoc(swaggerOptions);
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// ربط جميع المسارات
app.use('/api/auth', authRoutes);
app.use('/api/requests', requestsRoutes);
app.use('/api/map-locations', mapLocationsRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/medical-records', medicalRecordsRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/chat', chatRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ السيرفر شغال على البورت ${PORT}`);
});