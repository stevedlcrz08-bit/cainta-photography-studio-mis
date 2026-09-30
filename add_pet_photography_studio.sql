-- Cainta Photography Studio MIS
-- Script: Add a complete Pet Photography studio demo account
-- Run after the base schema and migrations have been applied.
--
-- Studio login credentials:
--   Email:    hello@pawprintstudio.ph
--   Password: PetStudio@2026
--
-- Payment credentials below are demo/test values only. Replace them before
-- enabling live payments or connecting a real payment provider.

START TRANSACTION;

SET @studio_id = 'ST-PAWPRINT26';
SET @owner_id = 'U-PAWPRINT26';
SET @category_id = 'cat-8';

-- Add a category that is not currently in the system.
INSERT INTO categories (id, name, description, created_at)
SELECT @category_id, 'Pet Photography',
       'Playful studio and lifestyle portraits for pets, owners, and animal families.',
       NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM categories WHERE name = 'Pet Photography'
);

/* Studio owner account. Password is bcrypt hash for: PetStudio@2026 */
INSERT INTO users (
    id, email, password_hash, full_name, role, studio_id,
    contact_number, address, created_at
)
SELECT
    @owner_id,
    'hello@pawprintstudio.ph',
    '$2b$10$leFU3syFJqTj/wuT71AoH.RJ9U9GNNETXS0et/TgdNlE7avdmU8gW',
    'Mikaela Santos',
    'STUDIO_ADMIN',
    @studio_id,
    '0917 555 0182',
    'Brookside Hills, San Isidro, Cainta, Rizal',
    NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM users
    WHERE id = @owner_id OR email = 'hello@pawprintstudio.ph'
);

-- Approved studio profile in the new Pet Photography category.
INSERT INTO studios (
    id, name, owner_id, logo, cover_image, location, rating, review_count,
    starting_price, categories, description, address, contact_info, email,
    business_hours, is_approved, status, printing_available, latitude,
    longitude, business_permit, valid_id, other_docs, created_at,
    registered_by_admin, blocked_dates
)
SELECT
    @studio_id,
    'Pawprint Portraits Studio',
    @owner_id,
    'https://images.unsplash.com/photo-1558788353-f76d92427f16?w=512&q=80',
    'https://images.unsplash.com/photo-1587300003388-59208cc962cb?w=1600&q=85',
    'Brookside Hills, San Isidro, Cainta, Rizal, Calabarzon, 1900, Philippines',
    0.00,
    0,
    1800.00,
    'Pet Photography',
    'A warm, pet-friendly portrait studio creating joyful keepsakes for dogs, cats, and the people who love them.',
    'Unit 4, Brookside Hills Commercial Center, Brookside Hills, San Isidro, Cainta, Rizal 1900',
    '0917 555 0182',
    'hello@pawprintstudio.ph',
    '10:00 AM - 07:00 PM',
    1,
    'approved',
    1,
    14.585420,
    121.114870,
    'DEMO-PERMIT-PAWPRINT-2026',
    'DEMO-VALID-ID-PAWPRINT-2026',
    'Pet-safe studio policy and vaccination requirements available on request.',
    NOW(),
    1,
    ''
WHERE NOT EXISTS (
    SELECT 1 FROM studios WHERE id = @studio_id
);

-- Services
INSERT INTO services (
    id, studio_id, name, description, category, base_price, duration_minutes,
    image, is_active, available_days, available_slots, requirements, created_at
)
SELECT
    'SRV-PAWPRINT-01', @studio_id, 'Pet Portrait Session',
    'A guided portrait session for one pet with treats, toys, and 10 edited digital images.',
    'Pet Photography', 1800.00, 60, NULL, 1,
    'Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday',
    '10:00 AM,12:00 PM,02:00 PM,04:00 PM,06:00 PM',
    'Bring a favorite toy; pets must be comfortable around people and camera equipment.', NOW()
WHERE NOT EXISTS (SELECT 1 FROM services WHERE id = 'SRV-PAWPRINT-01');

INSERT INTO services (
    id, studio_id, name, description, category, base_price, duration_minutes,
    image, is_active, available_days, available_slots, requirements, created_at
)
SELECT
    'SRV-PAWPRINT-02', @studio_id, 'Pet and Owner Story',
    'An intimate lifestyle session for a pet and up to three family members with 20 edited digital images.',
    'Pet Photography', 3200.00, 90, NULL, 1,
    'Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday',
    '10:00 AM,01:00 PM,04:00 PM',
    'Wear comfortable neutral colors; inform the studio of any pet sensitivities before booking.', NOW()
WHERE NOT EXISTS (SELECT 1 FROM services WHERE id = 'SRV-PAWPRINT-02');

INSERT INTO services (
    id, studio_id, name, description, category, base_price, duration_minutes,
    image, is_active, available_days, available_slots, requirements, created_at
)
SELECT
    'SRV-PAWPRINT-03', @studio_id, 'Rainbow Bridge Memorial',
    'A quiet remembrance session for cherished pets, including a framed 8x10 print and 12 edited images.',
    'Pet Photography', 2800.00, 75, NULL, 1,
    'Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday',
    '10:00 AM,01:00 PM,04:00 PM',
    'Please contact the studio privately so the team can prepare a gentle session plan.', NOW()
WHERE NOT EXISTS (SELECT 1 FROM services WHERE id = 'SRV-PAWPRINT-03');

-- Featured package
INSERT INTO packages (
    id, studio_id, name, description, price, duration_minutes,
    edited_photos_count, included_prints, photographer_count,
    included_services, terms_and_conditions, image, is_active, created_at
)
SELECT
    'PKG-PAWPRINT-01', @studio_id, 'The Whole Pack',
    'A complete family-and-pet experience with two outfit or setup changes.',
    5200.00, 120, 35, '1 framed 8x10 and 10 wallet prints', 2,
    'Pet Portrait Session,Pet and Owner Story',
    'A 30% non-refundable booking deposit is required. Rescheduling is allowed once with 48 hours notice. Pets must be supervised at all times.',
    NULL, 1, NOW()
WHERE NOT EXISTS (SELECT 1 FROM packages WHERE id = 'PKG-PAWPRINT-01');

-- Add-ons
INSERT INTO addons (id, studio_id, name, price, description, created_at, image)
SELECT 'ADD-PAWPRINT-01', @studio_id, 'Extra Edited Image', 150.00,
       'One additional high-resolution edited image.', NOW(), NULL
WHERE NOT EXISTS (SELECT 1 FROM addons WHERE id = 'ADD-PAWPRINT-01');

INSERT INTO addons (id, studio_id, name, price, description, created_at, image)
SELECT 'ADD-PAWPRINT-02', @studio_id, 'Framed 8x10 Print', 650.00,
       'Archival 8x10 print in a simple wood-tone frame.', NOW(), NULL
WHERE NOT EXISTS (SELECT 1 FROM addons WHERE id = 'ADD-PAWPRINT-02');

INSERT INTO addons (id, studio_id, name, price, description, created_at, image)
SELECT 'ADD-PAWPRINT-03', @studio_id, 'Pet Bandana Styling', 250.00,
       'Color-coordinated bandana styling with a short accessory portrait set.', NOW(), NULL
WHERE NOT EXISTS (SELECT 1 FROM addons WHERE id = 'ADD-PAWPRINT-03');

-- Weekly availability: Tuesday through Sunday, closed Monday.
INSERT INTO studio_availability (
    id, studio_id, day_of_week, opening_time, closing_time,
    is_available, slot_duration_minutes, created_at, updated_at
)
SELECT 'AVL-PAWPRINT-01', @studio_id, 0, '10:00 AM', '07:00 PM', 0, 60, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM studio_availability WHERE id = 'AVL-PAWPRINT-01');

INSERT INTO studio_availability (id, studio_id, day_of_week, opening_time, closing_time, is_available, slot_duration_minutes, created_at, updated_at)
SELECT 'AVL-PAWPRINT-02', @studio_id, 1, '10:00 AM', '07:00 PM', 1, 60, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM studio_availability WHERE id = 'AVL-PAWPRINT-02');

INSERT INTO studio_availability (id, studio_id, day_of_week, opening_time, closing_time, is_available, slot_duration_minutes, created_at, updated_at)
SELECT 'AVL-PAWPRINT-03', @studio_id, 2, '10:00 AM', '07:00 PM', 1, 60, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM studio_availability WHERE id = 'AVL-PAWPRINT-03');

INSERT INTO studio_availability (id, studio_id, day_of_week, opening_time, closing_time, is_available, slot_duration_minutes, created_at, updated_at)
SELECT 'AVL-PAWPRINT-04', @studio_id, 3, '10:00 AM', '07:00 PM', 1, 60, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM studio_availability WHERE id = 'AVL-PAWPRINT-04');

INSERT INTO studio_availability (id, studio_id, day_of_week, opening_time, closing_time, is_available, slot_duration_minutes, created_at, updated_at)
SELECT 'AVL-PAWPRINT-05', @studio_id, 4, '10:00 AM', '07:00 PM', 1, 60, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM studio_availability WHERE id = 'AVL-PAWPRINT-05');

INSERT INTO studio_availability (id, studio_id, day_of_week, opening_time, closing_time, is_available, slot_duration_minutes, created_at, updated_at)
SELECT 'AVL-PAWPRINT-06', @studio_id, 5, '10:00 AM', '07:00 PM', 1, 60, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM studio_availability WHERE id = 'AVL-PAWPRINT-06');

INSERT INTO studio_availability (id, studio_id, day_of_week, opening_time, closing_time, is_available, slot_duration_minutes, created_at, updated_at)
SELECT 'AVL-PAWPRINT-07', @studio_id, 6, '10:00 AM', '07:00 PM', 1, 60, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM studio_availability WHERE id = 'AVL-PAWPRINT-07');

-- Demo GCash merchant credentials. No live API keys are stored here.
INSERT INTO studio_payment_credentials (
    id, studio_id, gateway, gateway_sub_account_id,
    public_key_encrypted, secret_key_encrypted, webhook_secret_encrypted,
    gcash_merchant_name, gcash_number, is_live_mode, is_enabled,
    created_at, updated_at
)
SELECT
    'PAYCRED-PAWPRINT', @studio_id, 'paymongo', NULL,
    NULL, NULL, NULL,
    'Pawprint Portraits Studio', '09175550182', 0, 1, NOW(), NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM studio_payment_credentials
    WHERE studio_id = @studio_id AND gateway = 'paymongo'
);

INSERT INTO tenant_payment_methods (
    id, tenant_id, provider, method_type, merchant_name,
    merchant_account_identifier, qr_image_path, instructions,
    is_active, is_default, created_at, updated_at
)
SELECT
    'TPM-PAWPRINT', @studio_id, 'GCASH', 'DIGITAL_QR',
    'Pawprint Portraits Studio', '09175550182', NULL,
    'Use the studio GCash number and include your booking reference in the payment note.',
    1, 1, NOW(), NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM tenant_payment_methods
    WHERE id = 'TPM-PAWPRINT'
);

COMMIT;

-- Verification summary
SELECT id, email, full_name, role, studio_id
FROM users
WHERE id = @owner_id;

SELECT id, name, categories, email, status, starting_price
FROM studios
WHERE id = @studio_id;

SELECT id, name, description
FROM categories
WHERE name = 'Pet Photography';
