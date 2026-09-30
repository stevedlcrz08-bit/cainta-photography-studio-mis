-- ====================================================================
-- CAINTA PHOTOGRAPHY STUDIO MIS
-- Script: Add / Reset Super Admin User
-- Run this script on MySQL via phpMyAdmin or the MySQL CLI:
--   mysql -u root -p cainta_photography < add_superadmin.sql
-- ====================================================================

-- ----------------------------------------------------------------
-- HOW TO USE
-- ----------------------------------------------------------------
-- 1. Change the values below before running.
-- 2. The password stored below is already bcrypt-hashed.
--    Default plain-text password is:  Admin@123
--    To use a different password, generate a bcrypt hash first:
--      * Online tool : https://bcrypt-generator.com  (rounds = 10)
--      * Node.js     : require('bcrypt').hashSync('YourPassword', 10)
-- ----------------------------------------------------------------

-- Default credentials after running this script:
--   Email    : admin@caintaphotography.com
--   Password : Admin@123

INSERT INTO users (
    id,
    email,
    password_hash,
    full_name,
    role,
    studio_id,
    contact_number,
    address,
    created_at
)
VALUES (
    'u-superadmin',                                                   -- Unique ID
    'admin@caintaphotography.com',                                    -- Login email
    '$2b$10$KWzQUkhlejbbjajhZZSS3ONo1.Onq8MCGV6FDtQ1vWrH9TsHW7D6G', -- bcrypt hash of: Admin@123
    'System Super Admin',                                             -- Display name
    'SUPER_ADMIN',                                                    -- Role (do not change)
    NULL,                                                             -- No studio assigned
    '+63 900 000 0000',                                               -- Contact number
    'Cainta Municipal Hall, Rizal',                                   -- Address
    NOW()                                                             -- Created timestamp
)
ON DUPLICATE KEY UPDATE
    email          = VALUES(email),
    password_hash  = VALUES(password_hash),
    full_name      = VALUES(full_name),
    role           = VALUES(role),
    contact_number = VALUES(contact_number),
    address        = VALUES(address);

-- Confirm the inserted/updated row
SELECT
    id,
    email,
    full_name,
    role,
    contact_number,
    created_at
FROM users
WHERE id = 'u-superadmin';
