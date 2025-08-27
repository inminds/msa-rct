# TributAI - Automated Tax Diagnosis System

## Overview

TributAI is a comprehensive tax automation platform designed for Machado Schutz Advogados (MSH) that transforms manual tax diagnosis processes into an intelligent digital solution. The system processes fiscal files (SPED, XML, CSV), extracts NCM (Nomenclatura Comum do Mercosul) codes, and automatically calculates applicable taxes including ICMS, IPI, PIS, and COFINS based on jurisdiction (federal vs state).

The platform provides automated tax analysis, validation workflows, and comprehensive reporting to streamline tax compliance and reduce manual effort in tax diagnosis processes.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React with TypeScript using Vite as the build tool
- **UI Components**: Shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS with custom design tokens and CSS variables
- **State Management**: TanStack Query for server state management and data fetching
- **Routing**: Wouter for lightweight client-side routing
- **Forms**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express.js server framework
- **Language**: TypeScript with ES modules
- **API Design**: RESTful endpoints with consistent error handling
- **File Processing**: Multer for multipart file uploads with memory storage
- **Session Management**: Express sessions with PostgreSQL store
- **Build System**: ESBuild for production bundling

### Data Layer
- **Database**: PostgreSQL with Drizzle ORM for type-safe database operations
- **Database Provider**: Neon serverless PostgreSQL
- **Schema Management**: Drizzle Kit for migrations and schema management
- **Connection Pooling**: Neon serverless connection pooling

### Authentication & Authorization
- **Authentication**: Replit OpenID Connect (OIDC) integration
- **Session Storage**: PostgreSQL-backed sessions using connect-pg-simple
- **Authorization**: Role-based access control (ADMIN, ANALYST, USER)
- **Security**: Secure cookie configuration with HTTP-only flags

### File Processing Pipeline
- **SPED Files**: Custom parser for Brazilian SPED fiscal format
- **XML Processing**: xml2js library for NFe (Nota Fiscal Eletrônica) parsing
- **CSV Processing**: csv-parse library for structured data import
- **NCM Extraction**: Automated extraction of NCM codes from various file formats

### Tax Calculation Engine
- **Rule Engine**: Configurable tax rules database for different NCM codes
- **Tax Types**: Support for ICMS, IPI, PIS, and COFINS calculations
- **Jurisdiction Handling**: Federal vs state tax competency management
- **Validation Workflow**: Manual validation system for calculated taxes

### Monorepo Structure
- **Client**: React frontend application with component-based architecture
- **Server**: Express.js backend with service-oriented design
- **Shared**: Common TypeScript types and schemas using Zod
- **Database**: Centralized schema definitions with Drizzle ORM

## External Dependencies

### Database Services
- **Neon Database**: Serverless PostgreSQL hosting with connection pooling
- **Drizzle ORM**: Type-safe database toolkit with PostgreSQL support

### Authentication Services
- **Replit Auth**: OpenID Connect authentication provider
- **Passport.js**: Authentication middleware with OpenID Connect strategy

### Development Tools
- **Vite**: Frontend build tool with React plugin support
- **Replit Plugins**: Development environment integration and error handling

### File Processing Libraries
- **Multer**: Multipart form data handling for file uploads
- **xml2js**: XML parsing for Brazilian NFe documents
- **csv-parse**: CSV file processing and parsing

### UI & Styling
- **Tailwind CSS**: Utility-first CSS framework
- **Radix UI**: Headless UI primitives for complex components
- **Lucide React**: Icon library for consistent iconography
- **Shadcn/ui**: Pre-built component library with Tailwind integration

### State Management & Data Fetching
- **TanStack Query**: Server state management and caching
- **React Hook Form**: Form state management with validation
- **Zod**: Schema validation for type safety across client and server

### Build & Development
- **TypeScript**: Static type checking across the entire stack
- **ESBuild**: Fast JavaScript bundler for production builds
- **PostCSS**: CSS processing with Tailwind CSS integration