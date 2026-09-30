-- Insert the studio owner's user account without recreating the database.
-- The password_hash value matches the existing bcrypt credentials in db.json.

INSERT INTO users (
    id,
    email,
    password_hash,
    full_name,
    role,
    studio_id,
    contact_number,
    address
)
SELECT
    'U-NXFBJBZWS',
    'danielpadilla140600@gmail.com',
    '$2b$10$KWzQUkhlejbbjajhZZSS3ONo1.Onq8MCGV6FDtQ1vWrH9TsHW7D6G',
    'Rey esteban',
    'STUDIO_ADMIN',
    'ST-3PTND5UV9',
    '09944839843',
    'Narra St. Brgy San Roque Madera Homes Cainta Rizal'
WHERE NOT EXISTS (
    SELECT 1
    FROM users
    WHERE id = 'U-NXFBJBZWS'
       OR email = 'danielpadilla140600@gmail.com'
);