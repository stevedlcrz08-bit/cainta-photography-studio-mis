-- phpMyAdmin SQL Dump
-- version 5.2.1
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1
-- Generation Time: Sep 04, 2026 at 03:53 PM
-- Server version: 10.4.32-MariaDB
-- PHP Version: 8.2.12

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `cainta_photography_mis`
--

-- --------------------------------------------------------

--
-- Table structure for table `addons`
--

CREATE TABLE `addons` (
  `id` varchar(50) NOT NULL,
  `studio_id` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `description` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `image` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `addons`
--

INSERT INTO `addons` (`id`, `studio_id`, `name`, `price`, `description`, `created_at`, `image`) VALUES
('ADD-20ZGGK9JG', 'ST-KGIZMA8DH', 'Make up', 250.00, '', '2026-09-02 02:56:25', NULL),
('ADD-EK0ZPWXNM', 'ST-89X4NQ5QF', 'Hair- style for men', 50.00, '', '2026-09-04 13:02:07', '/api/media/MEDIA-R1F80C37J'),
('ADD-HTWNV3D3Z', 'ST-89X4NQ5QF', 'Make up', 80.00, '', '2026-09-04 13:02:25', '/api/media/MEDIA-USMAZ917V');

-- --------------------------------------------------------

--
-- Table structure for table `audit_logs`
--

CREATE TABLE `audit_logs` (
  `id` varchar(50) NOT NULL,
  `user_id` varchar(50) NOT NULL,
  `user_email` varchar(100) NOT NULL,
  `action` text NOT NULL,
  `entity_type` varchar(50) NOT NULL,
  `entity_id` varchar(50) NOT NULL,
  `timestamp` timestamp NOT NULL DEFAULT current_timestamp(),
  `ip_address` varchar(50) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `audit_logs`
--

INSERT INTO `audit_logs` (`id`, `user_id`, `user_email`, `action`, `entity_type`, `entity_id`, `timestamp`, `ip_address`) VALUES
('LOG-0MU60RE1L', 'system', 'system@cainta-mis.com', 'Updated system settings & UI config', 'SYSTEM', 'SETTINGS', '2026-09-04 12:30:17', NULL),
('LOG-0NZCKRK8C', 'system', 'system@cainta-mis.com', 'Updated system settings & UI config', 'SYSTEM', 'SETTINGS', '2026-09-04 12:31:09', NULL),
('LOG-1AUXSQ5TX', 'system', 'system@cainta-mis.com', 'Updated system settings & UI config', 'SYSTEM', 'SETTINGS', '2026-09-04 12:31:31', NULL),
('LOG-42ULKWZES', 'system', 'system@cainta-mis.com', 'Updated system settings & UI config', 'SYSTEM', 'SETTINGS', '2026-09-04 12:27:10', NULL),
('LOG-B1CPPFMR2', 'system', 'system@cainta-mis.com', 'Updated system settings & UI config', 'SYSTEM', 'SETTINGS', '2026-09-04 12:30:48', NULL),
('LOG-B6JISO1RV', 'system', 'system@cainta-mis.com', 'Updated system settings & UI config', 'SYSTEM', 'SETTINGS', '2026-09-04 12:30:27', NULL),
('LOG-CE4M1JQYO', 'system', 'system@cainta-mis.com', 'Updated system settings & UI config', 'SYSTEM', 'SETTINGS', '2026-09-04 12:27:19', NULL),
('LOG-CNWMS7KYU', 'system', 'system@cainta-mis.com', 'Updated system settings & UI config', 'SYSTEM', 'SETTINGS', '2026-09-04 12:31:58', NULL),
('LOG-EYEOJ3JKQ', 'system', 'system@cainta-mis.com', 'Updated system settings & UI config', 'SYSTEM', 'SETTINGS', '2026-09-04 12:30:38', NULL),
('LOG-K4P0DLCCL', 'system', 'system@cainta-mis.com', 'Updated system settings & UI config', 'SYSTEM', 'SETTINGS', '2026-09-04 12:31:14', NULL),
('LOG-Q9C644XNN', 'system', 'system@cainta-mis.com', 'Updated system settings & UI config', 'SYSTEM', 'SETTINGS', '2026-09-04 12:30:23', NULL),
('LOG-TELVDZ91N', 'system', 'system@cainta-mis.com', 'Updated system settings & UI config', 'SYSTEM', 'SETTINGS', '2026-09-04 12:31:01', NULL),
('LOG-TIBG3S72B', 'system', 'system@cainta-mis.com', 'Updated system settings & UI config', 'SYSTEM', 'SETTINGS', '2026-09-04 12:30:07', NULL),
('LOG-URLN8TXHO', 'system', 'system@cainta-mis.com', 'Updated system settings & UI config', 'SYSTEM', 'SETTINGS', '2026-09-04 12:22:34', NULL),
('LOG-WB1PDURSL', 'system', 'system@cainta-mis.com', 'Updated system settings & UI config', 'SYSTEM', 'SETTINGS', '2026-09-04 12:27:25', NULL);

-- --------------------------------------------------------

--
-- Table structure for table `bookings`
--

CREATE TABLE `bookings` (
  `id` varchar(50) NOT NULL,
  `studio_id` varchar(50) NOT NULL,
  `customer_id` varchar(50) NOT NULL,
  `service_id` varchar(50) NOT NULL,
  `package_id` varchar(50) NOT NULL,
  `booking_date` date NOT NULL,
  `time_slot` varchar(50) NOT NULL,
  `addons` text DEFAULT NULL,
  `customer_name` varchar(100) NOT NULL,
  `customer_email` varchar(100) NOT NULL,
  `customer_phone` varchar(50) NOT NULL,
  `customer_notes` text DEFAULT NULL,
  `requirements_doc` varchar(255) DEFAULT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'Pending',
  `total_amount` decimal(10,2) NOT NULL,
  `amount_paid` decimal(10,2) DEFAULT 0.00,
  `down_payment_amount` decimal(10,2) DEFAULT 0.00,
  `remaining_balance` decimal(10,2) DEFAULT 0.00,
  `payment_status` varchar(50) DEFAULT 'Unpaid',
  `final_payment_status` varchar(50) DEFAULT 'Pending',
  `payment_due_at` timestamp NULL DEFAULT NULL,
  `cancellation_reason` text DEFAULT NULL,
  `cancelled_by` varchar(50) DEFAULT NULL,
  `cancelled_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `categories`
--

CREATE TABLE `categories` (
  `id` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `categories`
--

INSERT INTO `categories` (`id`, `name`, `description`, `created_at`) VALUES
('cat-1', 'Portrait Photography', 'Professional close-up and profile pictures.', '2025-12-31 16:00:00'),
('cat-2', 'Graduation Photography', 'Celebrate milestones with premium cap and gown sessions.', '2025-12-31 16:00:00'),
('cat-3', 'Wedding Photography', 'Timeless storytelling of your special union.', '2025-12-31 16:00:00'),
('cat-5', 'Family Photography', 'Cherish precious bonding moments in crisp frames.', '2025-12-31 16:00:00'),
('cat-6', 'Self-Shoot Studio', 'Express yourself freely behind a private clicker.', '2025-12-31 16:00:00'),
('cat-7', 'ID/Passport Photography', 'Official, compliant photos in instant minutes.', '2025-12-31 16:00:00');

-- --------------------------------------------------------

--
-- Table structure for table `cms_settings`
--

CREATE TABLE `cms_settings` (
  `id` varchar(100) NOT NULL,
  `key` varchar(100) NOT NULL,
  `value` text NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `cms_settings`
--

INSERT INTO `cms_settings` (`id`, `key`, `value`) VALUES
('aboutDescription', 'aboutDescription', 'Experience the difference of calibrated Profoto strobes, true-to-life skin tones, and meticulous post-processing by Cainta\'s leading photographers.'),
('aboutTitle', 'aboutTitle', 'Pristine Studio Lighting & Retouching'),
('featuresSubtitle', 'featuresSubtitle', 'Explore photography styles and packages suited to your milestones.'),
('featuresTitle', 'featuresTitle', 'Spotlight Studios in Cainta, Rizal'),
('heroBackground', 'heroBackground', ''),
('heroSubtitle', 'heroSubtitle', 'Discover accredited photography studios in Cainta, Rizal. Compare live calendar availability, customize grad & creative packages, inspect RAW vs retouched portfolios, and order gallery-grade physical wall prints.'),
('heroTitle', 'heroTitle', 'Frame Your Story. <br /> Book Cainta Studios.');

-- --------------------------------------------------------

--
-- Table structure for table `customers`
--

CREATE TABLE `customers` (
  `id` varchar(50) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `full_name` varchar(100) NOT NULL,
  `contact_number` varchar(50) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `customers`
--

INSERT INTO `customers` (`id`, `email`, `password_hash`, `full_name`, `contact_number`, `address`, `created_at`) VALUES
('CUST-KTRD1KJP1', 'unknownalienware12@gmail.com', '$2b$10$B8PMH3OwPvbWPNWEkb2OqOsNegOzSrMP9apxsKSCbwXVkU.Ekksim', 'Monique Nisha Mendoza', '09045454343', NULL, '2026-09-02 03:16:59');

-- --------------------------------------------------------

--
-- Table structure for table `faqs`
--

CREATE TABLE `faqs` (
  `id` varchar(50) NOT NULL,
  `studio_id` varchar(50) NOT NULL,
  `question` text NOT NULL,
  `answer` text NOT NULL,
  `category` varchar(100) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `favorites`
--

CREATE TABLE `favorites` (
  `id` varchar(50) NOT NULL,
  `customer_id` varchar(50) NOT NULL,
  `studio_id` varchar(50) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `favorites`
--

INSERT INTO `favorites` (`id`, `customer_id`, `studio_id`, `created_at`) VALUES
('FAV-67O0IMKV8', 'CUST-KTRD1KJP1', 'ST-KGIZMA8DH', '2026-09-02 11:09:38'),
('FAV-SRPQRJO6W', 'CUST-KTRD1KJP1', 'ST-89X4NQ5QF', '2026-09-04 13:12:39');

-- --------------------------------------------------------

--
-- Table structure for table `gcash_qr_sessions`
--

CREATE TABLE `gcash_qr_sessions` (
  `id` varchar(50) NOT NULL,
  `payment_id` varchar(50) DEFAULT NULL,
  `booking_id` varchar(50) DEFAULT NULL,
  `print_order_id` varchar(50) DEFAULT NULL,
  `studio_id` varchar(50) NOT NULL,
  `customer_id` varchar(50) NOT NULL,
  `gateway` varchar(20) NOT NULL DEFAULT 'paymongo',
  `gateway_payment_intent_id` varchar(255) DEFAULT NULL,
  `gateway_source_id` varchar(255) DEFAULT NULL,
  `gateway_checkout_url` text DEFAULT NULL,
  `qr_code_data` longtext DEFAULT NULL,
  `amount` decimal(10,2) NOT NULL,
  `payment_type` varchar(30) NOT NULL DEFAULT 'Downpayment',
  `status` varchar(50) NOT NULL DEFAULT 'pending',
  `expires_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `webhook_event_id` varchar(255) DEFAULT NULL,
  `paid_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `media_files`
--

CREATE TABLE `media_files` (
  `id` varchar(50) NOT NULL,
  `owner_id` varchar(50) NOT NULL,
  `entity_type` varchar(50) NOT NULL,
  `entity_id` varchar(50) NOT NULL,
  `purpose` varchar(50) NOT NULL,
  `original_name` varchar(255) DEFAULT NULL,
  `mime_type` varchar(100) NOT NULL,
  `size_bytes` bigint(20) NOT NULL,
  `checksum` varchar(128) NOT NULL,
  `storage_key` varchar(255) NOT NULL,
  `access_status` varchar(30) NOT NULL DEFAULT 'quarantined',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `media_files`
--

INSERT INTO `media_files` (`id`, `owner_id`, `entity_type`, `entity_id`, `purpose`, `original_name`, `mime_type`, `size_bytes`, `checksum`, `storage_key`, `access_status`, `created_at`) VALUES
('MEDIA-0A70M7YSD', 'U-6EPTFFF2F', 'addon', 'ADD-T3B7AEM84', 'ADDON_IMAGE', 'addon-image', 'image/png', 1804783, 'bdb9b7cae9f65d32d5c9c0b48733516384a2f8c8869b3ef68173052a9a106034', 'MEDIA-0A70M7YSD.png', 'active', '2026-09-04 13:01:32'),
('MEDIA-15AN1YTO2', 'U-6EPTFFF2F', 'studio', 'ST-89X4NQ5QF', 'STUDIO_LOGO', 'logo', 'image/png', 1211323, '53662bb65d431b98c1a2580122ba39ea36f2a01303756772602e797cf9174a19', 'MEDIA-15AN1YTO2.png', 'active', '2026-09-03 10:49:41'),
('MEDIA-2CVTLL232', 'U-4IGCHF41A', 'photo-proofing', 'PRF-B64UJNKFY', 'PROOF_PHOTO', 'ภาพครอบครัวสิริสุขะ.jpg', 'image/jpeg', 66658, '8e1b920a877b4e8909f48c090a6ffa1852c42d536ac3343e6c8284ce9e8a1b1a', 'MEDIA-2CVTLL232.jpeg', 'active', '2026-09-02 07:58:24'),
('MEDIA-33WDWOA0P', 'U-6EPTFFF2F', 'package', 'PKG-7U1WAPB78', 'PACKAGE_IMAGE', 'package-image', 'image/png', 1755714, 'f7213c1078b8631f221c5b07770c052649a7b714e020c90c0cd366408338488a', 'MEDIA-33WDWOA0P.png', 'active', '2026-09-04 11:14:38'),
('MEDIA-3AOUU04LK', 'CUST-KTRD1KJP1', 'print-order', 'PR-2026-NYAINY47M', 'PRINT_UPLOAD', 'print-photo', 'image/jpeg', 63725, '02d497045bd8dcc8e96e3a1793768f6e0f4b8900905a1865f92e86b42697abe4', 'MEDIA-3AOUU04LK.jpeg', 'active', '2026-09-02 09:01:13'),
('MEDIA-44XTSZJQ6', 'U-DJ5I7JJRA', 'studio', 'ST-HGYPGX0SN', 'SUPPORTING_DOCUMENT', 'supporting-document', 'image/jpeg', 3901, 'ac3ab6deff529af78f88731f0bdf1651a3b2796dfdcb64cba19913c9f03ed311', 'MEDIA-44XTSZJQ6.jpeg', 'active', '2026-08-27 10:44:47'),
('MEDIA-4W6QZJK18', 'U-DJ5I7JJRA', 'studio', 'ST-HGYPGX0SN', 'BUSINESS_PERMIT', 'business-permit', 'application/pdf', 9365, '9d562e53c4d208735b0b9f4db87b238781307ed2f2f0349842b312abad5bb0d8', 'MEDIA-4W6QZJK18.pdf', 'active', '2026-08-27 10:44:46'),
('MEDIA-58Y2JTZTF', 'CUST-KTRD1KJP1', 'print-order', 'PR-2026-MG5O3U1ZD', 'PRINT_UPLOAD', 'print-photo', 'image/png', 143431, '3d0a661b9a62185e7e1fefc20b261f4ce0a554c86742fe86c29941e0fe553bed', 'MEDIA-58Y2JTZTF.png', 'active', '2026-09-02 10:30:57'),
('MEDIA-5XM5XMCL1', 'U-4IGCHF41A', 'service', 'SRV-BRH6KRWP8', 'SERVICE_IMAGE', 'service-image', 'image/png', 2266139, 'd80e92c011484aa0547cefc9159f43a9ad900d50a3584f4bab63c41b243530b5', 'MEDIA-5XM5XMCL1.png', 'active', '2026-09-02 02:54:59'),
('MEDIA-6UMUH3HVQ', 'U-6EPTFFF2F', 'photo-proofing', 'PRF-YEYQ7ZO6P', 'PROOF_PHOTO', '664562488804570665.jpg', 'image/jpeg', 63725, '02d497045bd8dcc8e96e3a1793768f6e0f4b8900905a1865f92e86b42697abe4', 'MEDIA-6UMUH3HVQ.jpeg', 'active', '2026-09-04 09:17:44'),
('MEDIA-8ATTMRN66', 'CUST-KTRD1KJP1', 'print-order', 'PR-2026-DP025CHU3', 'PAYMENT_PROOF', 'print-payment-proof', 'image/jpeg', 295758, '072d5368fb5b9012f54b762429e4df848aaef16851ae3825b6699a861b23775a', 'MEDIA-8ATTMRN66.jpeg', 'active', '2026-09-04 13:06:10'),
('MEDIA-8UJGITQGI', 'CUST-KTRD1KJP1', 'print-order', 'PR-2026-MG5O3U1ZD', 'PAYMENT_PROOF', 'print-payment-proof', 'image/jpeg', 71967, 'a87ff082a3c68a23bf8063ee4e6017413f2b4ef5fbd98723df43ce0fa6ea9d07', 'MEDIA-8UJGITQGI.jpeg', 'active', '2026-09-02 10:31:01'),
('MEDIA-9ATSFP6MT', 'CUST-K3AYEDZG4', 'payment', 'PAY-BRY00U1E0', 'PAYMENT_PROOF', 'payment-proof', 'image/jpeg', 25698, '678c8a04a49f215dc6ed176a19f8d68115cc9950bbb25820519f70f4f0b63d0f', 'MEDIA-9ATSFP6MT.jpeg', 'active', '2026-08-29 10:17:39'),
('MEDIA-9PMWW8EB7', 'U-DJ5I7JJRA', 'studio', 'ST-HGYPGX0SN', 'OWNER_VALID_ID', 'owner-valid-id', 'image/jpeg', 3901, 'ac3ab6deff529af78f88731f0bdf1651a3b2796dfdcb64cba19913c9f03ed311', 'MEDIA-9PMWW8EB7.jpeg', 'active', '2026-08-27 10:44:47'),
('MEDIA-9SBZ81ME4', 'u-superadmin', 'cms', 'heroBackground', 'HERO_BACKGROUND', 'ChatGPT Image Sep 4, 2026, 07_50_49 PM.png', 'image/png', 1794588, '4f840e66aa24134859483859e8cae20180a4768c7b136eae515312aaf3fc2df6', 'MEDIA-9SBZ81ME4.png', 'active', '2026-09-04 12:02:50'),
('MEDIA-9V18MOK2N', 'U-6EPTFFF2F', 'studio', 'ST-89X4NQ5QF', 'STUDIO_COVER', 'coverImage', 'image/png', 1814104, '3d38621ea145c3d60fbbd18bbdd87a46ceb120683846bb9c2e8d06ae2d67e825', 'MEDIA-9V18MOK2N.png', 'active', '2026-09-03 10:49:42'),
('MEDIA-A1GMRREGU', 'U-6EPTFFF2F', 'photo-proofing', 'PRF-YEYQ7ZO6P', 'PROOF_PHOTO', 'ภาพครอบครัวสิริสุขะ.jpg', 'image/jpeg', 66658, '8e1b920a877b4e8909f48c090a6ffa1852c42d536ac3343e6c8284ce9e8a1b1a', 'MEDIA-A1GMRREGU.jpeg', 'active', '2026-09-04 09:17:45'),
('MEDIA-AOOTQGPCL', 'U-4IGCHF41A', 'photo-proofing', 'PRF-B64UJNKFY', 'PROOF_PHOTO', '664562488804570665.jpg', 'image/jpeg', 63725, '02d497045bd8dcc8e96e3a1793768f6e0f4b8900905a1865f92e86b42697abe4', 'MEDIA-AOOTQGPCL.jpeg', 'active', '2026-09-02 07:58:22'),
('MEDIA-BUUZCET4A', 'u-superadmin', 'cms', 'heroBackground', 'HERO_BACKGROUND', 'download.jfif', 'image/jpeg', 3901, 'ac3ab6deff529af78f88731f0bdf1651a3b2796dfdcb64cba19913c9f03ed311', 'MEDIA-BUUZCET4A.jpeg', 'active', '2026-09-02 01:54:22'),
('MEDIA-DG8OYBQLT', 'U-6EPTFFF2F', 'print-product', 'PRD-C12VWIX50', 'PRINT_PRODUCT_IMAGE', 'print-product-2', 'image/png', 1804783, 'bdb9b7cae9f65d32d5c9c0b48733516384a2f8c8869b3ef68173052a9a106034', 'MEDIA-DG8OYBQLT.png', 'active', '2026-09-04 13:00:51'),
('MEDIA-DJS9JJQO9', 'CUST-KTRD1KJP1', 'print-order', 'PR-2026-3H85OZ38L', 'PRINT_UPLOAD', 'print-photo', 'image/png', 1755714, 'f7213c1078b8631f221c5b07770c052649a7b714e020c90c0cd366408338488a', 'MEDIA-DJS9JJQO9.png', 'active', '2026-09-04 09:19:40'),
('MEDIA-E6MEU2SX8', 'u-superadmin', 'cms', 'heroBackground', 'HERO_BACKGROUND', 'ChatGPT Image Sep 3, 2026, 06_31_13 PM.png', 'image/png', 1211323, '53662bb65d431b98c1a2580122ba39ea36f2a01303756772602e797cf9174a19', 'MEDIA-E6MEU2SX8.png', 'active', '2026-09-04 10:36:58'),
('MEDIA-FBSU1W9DU', 'u-superadmin', 'cms', 'heroBackground', 'HERO_BACKGROUND', 'ChatGPT Image Sep 4, 2026, 07_50_49 PM.png', 'image/png', 1794588, '4f840e66aa24134859483859e8cae20180a4768c7b136eae515312aaf3fc2df6', 'MEDIA-FBSU1W9DU.png', 'active', '2026-09-04 11:51:54'),
('MEDIA-GQ9K4P6QE', 'U-4IGCHF41A', 'photo-proofing', 'PRF-B888G8D1G', 'PROOF_PHOTO', '44824958788843220.jpg', 'image/jpeg', 96326, '44d9861de8ca40b27751994d8d2b1bf2002b76cd07d28471aa715fa948663f92', 'MEDIA-GQ9K4P6QE.jpeg', 'active', '2026-09-02 07:16:04'),
('MEDIA-H0G9Y1JK4', 'U-6EPTFFF2F', 'photo-proofing', 'PRF-YEYQ7ZO6P', 'PROOF_PHOTO', '44824958788843220.jpg', 'image/jpeg', 96326, '44d9861de8ca40b27751994d8d2b1bf2002b76cd07d28471aa715fa948663f92', 'MEDIA-H0G9Y1JK4.jpeg', 'active', '2026-09-04 09:17:44'),
('MEDIA-HECWHHQLF', 'CUST-KTRD1KJP1', 'print-order', 'PR-2026-DP025CHU3', 'PRINT_UPLOAD', 'print-photo', 'image/jpeg', 952714, '563671a167f791c38c742cd527e6cc6091f2f1f00b83ec2ce0062b82016a7c0b', 'MEDIA-HECWHHQLF.jpeg', 'active', '2026-09-04 13:06:10'),
('MEDIA-HN93FL825', 'CUST-KTRD1KJP1', 'payment', 'PAY-BPQMN74SU', 'PAYMENT_PROOF', 'payment-proof', 'image/jpeg', 295758, '072d5368fb5b9012f54b762429e4df848aaef16851ae3825b6699a861b23775a', 'MEDIA-HN93FL825.jpeg', 'active', '2026-09-04 07:59:48'),
('MEDIA-HNVM5HXHZ', 'U-6EPTFFF2F', 'addon', 'ADD-6R40WZE3D', 'ADDON_IMAGE', 'addon-image', 'image/png', 1755714, 'f7213c1078b8631f221c5b07770c052649a7b714e020c90c0cd366408338488a', 'MEDIA-HNVM5HXHZ.png', 'active', '2026-09-04 11:16:00'),
('MEDIA-IG8GY2YAE', 'CUST-KTRD1KJP1', 'payment', 'PAY-DJ2W865SD', 'PAYMENT_PROOF', 'payment-proof', 'image/jpeg', 3901, 'ac3ab6deff529af78f88731f0bdf1651a3b2796dfdcb64cba19913c9f03ed311', 'MEDIA-IG8GY2YAE.jpeg', 'active', '2026-09-02 04:30:32'),
('MEDIA-J7E1TA6MZ', 'U-4IGCHF41A', 'studio', 'ST-KGIZMA8DH', 'SUPPORTING_DOCUMENT', 'supporting-document', 'image/jpeg', 3901, 'ac3ab6deff529af78f88731f0bdf1651a3b2796dfdcb64cba19913c9f03ed311', 'MEDIA-J7E1TA6MZ.jpeg', 'active', '2026-09-02 02:47:00'),
('MEDIA-JBOVM526G', 'U-DJ5I7JJRA', 'studio', 'ST-HGYPGX0SN', 'STUDIO_LOGO', 'logo', 'image/png', 981539, 'e8da5e194969807d4d8f9a7979482dfd593c528a7f3cfcd1cd646d82eeb36850', 'MEDIA-JBOVM526G.png', 'active', '2026-08-29 09:54:12'),
('MEDIA-JQF6AHC7M', 'U-4IGCHF41A', 'studio', 'ST-KGIZMA8DH', 'BUSINESS_PERMIT', 'business-permit', 'image/jpeg', 3901, 'ac3ab6deff529af78f88731f0bdf1651a3b2796dfdcb64cba19913c9f03ed311', 'MEDIA-JQF6AHC7M.jpeg', 'active', '2026-09-02 02:46:37'),
('MEDIA-KBCXLXABI', 'CUST-KTRD1KJP1', 'print-order', 'PR-2026-INFSCMWUX', 'PAYMENT_PROOF', 'print-payment-proof', 'image/jpeg', 71967, 'a87ff082a3c68a23bf8063ee4e6017413f2b4ef5fbd98723df43ce0fa6ea9d07', 'MEDIA-KBCXLXABI.jpeg', 'active', '2026-09-03 04:27:31'),
('MEDIA-KBTH49SEP', 'U-4IGCHF41A', 'studio', 'ST-KGIZMA8DH', 'STUDIO_COVER', 'coverImage', 'image/png', 1723304, '52ae98064042ac74d141f954691f4d59207c1f38b0e7cd6f5237b4de9920bafe', 'MEDIA-KBTH49SEP.png', 'active', '2026-09-02 02:50:36'),
('MEDIA-KWEDENT2N', 'U-6EPTFFF2F', 'print-product', 'PRD-C12VWIX50', 'PRINT_PRODUCT_IMAGE', 'print-product-1', 'image/png', 1755714, 'f7213c1078b8631f221c5b07770c052649a7b714e020c90c0cd366408338488a', 'MEDIA-KWEDENT2N.png', 'active', '2026-09-04 13:00:51'),
('MEDIA-LJZABOPJ1', 'u-superadmin', 'cms', 'heroBackground', 'HERO_BACKGROUND', 'ChatGPT Image Sep 4, 2026, 07_50_49 PM.png', 'image/png', 1794588, '4f840e66aa24134859483859e8cae20180a4768c7b136eae515312aaf3fc2df6', 'MEDIA-LJZABOPJ1.png', 'active', '2026-09-04 11:50:59'),
('MEDIA-LNWYGDXMH', 'CUST-KTRD1KJP1', 'print-order', 'PR-2026-NYAINY47M', 'PAYMENT_PROOF', 'print-payment-proof', 'image/jpeg', 53296, '37f639966fb0342095d32f71b4ac0bdce69ae37e6e2e70ff5652655a0ccc9915', 'MEDIA-LNWYGDXMH.jpeg', 'active', '2026-09-02 09:02:43'),
('MEDIA-LQKL6U0XF', 'U-6EPTFFF2F', 'studio', 'ST-89X4NQ5QF', 'OWNER_VALID_ID', 'owner-valid-id', 'image/png', 2247916, 'caca4f0c4d09f43177c20bf58c1eebc735357c9c75efe9cad3372c7a2453be7f', 'MEDIA-LQKL6U0XF.png', 'active', '2026-09-03 10:48:24'),
('MEDIA-OI659F5U8', 'CUST-KTRD1KJP1', 'print-order', 'PR-2026-3H85OZ38L', 'PAYMENT_PROOF', 'print-payment-proof', 'image/jpeg', 295758, '072d5368fb5b9012f54b762429e4df848aaef16851ae3825b6699a861b23775a', 'MEDIA-OI659F5U8.jpeg', 'active', '2026-09-04 09:19:41'),
('MEDIA-PXFZ1WFM8', 'u-superadmin', 'system', 'demo-video', 'SYSTEM_DEMO_VIDEO', 'YTDown.com_YouTube_Product-Demo-Video-SaaS-Explainer-Video-_Media_ZK-rNEhJIDs_001_1080p.mp4', 'video/mp4', 4819916, '60011eebf28df93e373b91aad15b094ee7678a7228035aff512b4fa18c2649f9', 'MEDIA-PXFZ1WFM8.mp4', 'active', '2026-09-04 07:25:10'),
('MEDIA-R1F80C37J', 'U-6EPTFFF2F', 'addon', 'ADD-EK0ZPWXNM', 'ADDON_IMAGE', 'addon-image', 'image/png', 1804783, 'bdb9b7cae9f65d32d5c9c0b48733516384a2f8c8869b3ef68173052a9a106034', 'MEDIA-R1F80C37J.png', 'active', '2026-09-04 13:02:07'),
('MEDIA-RKU8JAXM8', 'U-6EPTFFF2F', 'print-product', 'PRD-95BRJSN9L', 'PRINT_PRODUCT_IMAGE', 'print-product-2', 'image/png', 1804783, 'bdb9b7cae9f65d32d5c9c0b48733516384a2f8c8869b3ef68173052a9a106034', 'MEDIA-RKU8JAXM8.png', 'active', '2026-09-04 13:00:48'),
('MEDIA-S2ZGJ2HMJ', 'U-4IGCHF41A', 'photo-proofing', 'PRF-B64UJNKFY', 'PROOF_PHOTO', '44824958788843220.jpg', 'image/jpeg', 96326, '44d9861de8ca40b27751994d8d2b1bf2002b76cd07d28471aa715fa948663f92', 'MEDIA-S2ZGJ2HMJ.jpeg', 'active', '2026-09-02 07:58:23'),
('MEDIA-S9P465XKJ', 'U-6EPTFFF2F', 'studio', 'ST-89X4NQ5QF', 'BUSINESS_PERMIT', 'business-permit', 'image/png', 1913437, 'e4fbfa554540e0b169fece1ef61440d8aac043943a5fdbcab2f052ee6edbc30e', 'MEDIA-S9P465XKJ.png', 'active', '2026-09-03 10:48:22'),
('MEDIA-SH8TK8J1A', 'CUST-KTRD1KJP1', 'payment', 'PAY-HH9E9JG1M', 'PAYMENT_PROOF', 'payment-proof', 'image/png', 1532465, '083b30ec2fffe25e68661fdba5561768467e756a42d8705859c67a120e8aee8e', 'MEDIA-SH8TK8J1A.png', 'active', '2026-09-04 04:10:40'),
('MEDIA-SPA8380WK', 'U-DJ5I7JJRA', 'service', 'SRV-XT1LPBN77', 'SERVICE_IMAGE', 'service-image', 'image/png', 2266139, 'd80e92c011484aa0547cefc9159f43a9ad900d50a3584f4bab63c41b243530b5', 'MEDIA-SPA8380WK.png', 'active', '2026-08-29 10:12:01'),
('MEDIA-TVORCHKJT', 'U-DJ5I7JJRA', 'studio', 'ST-HGYPGX0SN', 'STUDIO_COVER', 'coverImage', 'image/png', 1723304, '52ae98064042ac74d141f954691f4d59207c1f38b0e7cd6f5237b4de9920bafe', 'MEDIA-TVORCHKJT.png', 'active', '2026-08-29 09:54:13'),
('MEDIA-UL70XPMTN', 'CUST-KTRD1KJP1', 'print-order', 'PR-2026-INFSCMWUX', 'PRINT_UPLOAD', 'print-photo', 'image/png', 48730, '6b2dd8519b2635c732e3a9f2a4b587a37e66acb25c63901c02469d7c40750ffb', 'MEDIA-UL70XPMTN.png', 'active', '2026-09-03 04:27:31'),
('MEDIA-USMAZ917V', 'U-6EPTFFF2F', 'addon', 'ADD-HTWNV3D3Z', 'ADDON_IMAGE', 'addon-image', 'image/png', 1755714, 'f7213c1078b8631f221c5b07770c052649a7b714e020c90c0cd366408338488a', 'MEDIA-USMAZ917V.png', 'active', '2026-09-04 13:02:25'),
('MEDIA-UVG5VTZA3', 'U-6EPTFFF2F', 'print-product', 'PRD-95BRJSN9L', 'PRINT_PRODUCT_IMAGE', 'print-product-1', 'image/png', 1755714, 'f7213c1078b8631f221c5b07770c052649a7b714e020c90c0cd366408338488a', 'MEDIA-UVG5VTZA3.png', 'active', '2026-09-04 13:00:48'),
('MEDIA-VYLP7YHN9', 'U-6EPTFFF2F', 'addon', 'ADD-Q5GBAJYZU', 'ADDON_IMAGE', 'addon-image', 'image/png', 1755714, 'f7213c1078b8631f221c5b07770c052649a7b714e020c90c0cd366408338488a', 'MEDIA-VYLP7YHN9.png', 'active', '2026-09-04 11:22:46'),
('MEDIA-X4YWM7X5P', 'U-4IGCHF41A', 'studio', 'ST-KGIZMA8DH', 'STUDIO_LOGO', 'logo', 'image/png', 981539, 'e8da5e194969807d4d8f9a7979482dfd593c528a7f3cfcd1cd646d82eeb36850', 'MEDIA-X4YWM7X5P.png', 'active', '2026-09-02 02:50:18'),
('MEDIA-X90Z32UCE', 'U-4IGCHF41A', 'service', 'SRV-TKZRL8LJJ', 'SERVICE_IMAGE', 'service-image', 'image/png', 1532465, '083b30ec2fffe25e68661fdba5561768467e756a42d8705859c67a120e8aee8e', 'MEDIA-X90Z32UCE.png', 'active', '2026-09-03 06:34:50'),
('MEDIA-XQP0C98L4', 'U-6EPTFFF2F', 'service', 'SRV-7P1C113GE', 'SERVICE_IMAGE', 'service-image', 'image/png', 1932267, '8451430d025a11bb0ea5d089eb46af37169944f394e24b3711641709ef481b6b', 'MEDIA-XQP0C98L4.png', 'active', '2026-09-03 10:54:14'),
('MEDIA-XW5Z9V4YI', 'u-superadmin', 'cms', 'heroBackground', 'HERO_BACKGROUND', 'ChatGPT Image Sep 4, 2026, 07_50_49 PM.png', 'image/png', 1794588, '4f840e66aa24134859483859e8cae20180a4768c7b136eae515312aaf3fc2df6', 'MEDIA-XW5Z9V4YI.png', 'active', '2026-09-04 12:15:53'),
('MEDIA-YJI0FW35G', 'U-4IGCHF41A', 'studio', 'ST-KGIZMA8DH', 'OWNER_VALID_ID', 'owner-valid-id', 'image/jpeg', 3901, 'ac3ab6deff529af78f88731f0bdf1651a3b2796dfdcb64cba19913c9f03ed311', 'MEDIA-YJI0FW35G.jpeg', 'active', '2026-09-02 02:46:50');

-- --------------------------------------------------------

--
-- Table structure for table `notifications`
--

CREATE TABLE `notifications` (
  `id` varchar(50) NOT NULL,
  `user_id` varchar(50) NOT NULL,
  `studio_id` varchar(50) DEFAULT NULL,
  `title` varchar(150) NOT NULL,
  `message` text NOT NULL,
  `is_read` tinyint(1) DEFAULT 0,
  `type` varchar(50) NOT NULL,
  `channel` varchar(50) DEFAULT 'App',
  `recipient_contact` varchar(100) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `notifications`
--

INSERT INTO `notifications` (`id`, `user_id`, `studio_id`, `title`, `message`, `is_read`, `type`, `channel`, `recipient_contact`, `created_at`) VALUES
('NOTIF-5SN3OBY2D', 'CUST-KTRD1KJP1', NULL, 'Print Order Update', 'Your print order PR-2026-DP025CHU3 status is now: Ready for Pickup', 0, 'info', 'App', NULL, '2026-09-04 13:08:17'),
('NOTIF-CV8P1APGV', 'CUST-KTRD1KJP1', NULL, 'Print Order Update', 'Your print order PR-2026-DP025CHU3 status is now: Quality Check', 0, 'info', 'App', NULL, '2026-09-04 13:08:07'),
('NOTIF-GV0RJE8ZS', 'CUST-KTRD1KJP1', NULL, 'Print Order Update', 'Your print order PR-2026-DP025CHU3 status is now: Confirmed', 0, 'info', 'App', NULL, '2026-09-04 13:07:49'),
('NOTIF-R6GWCW1XH', 'U-6EPTFFF2F', 'ST-89X4NQ5QF', 'New Print Order', 'A new print order (PR-2026-DP025CHU3) has been received.', 0, 'warning', 'App', NULL, '2026-09-04 13:06:10'),
('NOTIF-XE6TG28KY', 'CUST-KTRD1KJP1', NULL, 'Print Order Update', 'Your print order PR-2026-DP025CHU3 status is now: Processing', 0, 'info', 'App', NULL, '2026-09-04 13:07:58'),
('NOTIF-XXTWUAM7C', 'CUST-KTRD1KJP1', NULL, 'Print Order Update', 'Your print order PR-2026-DP025CHU3 status is now: Completed', 0, 'info', 'App', NULL, '2026-09-04 13:08:31');

-- --------------------------------------------------------

--
-- Table structure for table `packages`
--

CREATE TABLE `packages` (
  `id` varchar(50) NOT NULL,
  `studio_id` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `duration_minutes` int(11) NOT NULL,
  `edited_photos_count` int(11) NOT NULL,
  `included_prints` varchar(150) NOT NULL,
  `photographer_count` int(11) DEFAULT 1,
  `included_services` text DEFAULT NULL,
  `terms_and_conditions` text NOT NULL,
  `image` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `packages`
--

INSERT INTO `packages` (`id`, `studio_id`, `name`, `description`, `price`, `duration_minutes`, `edited_photos_count`, `included_prints`, `photographer_count`, `included_services`, `terms_and_conditions`, `image`, `is_active`, `created_at`) VALUES
('PKG-7U1WAPB78', 'ST-89X4NQ5QF', 'Basic Graduation', '1 toga portrait, 1 formal portrait, 2 pcs 5R prints, digital copy', 500.00, 60, 50, '1', 2, '', 'No terms specified.', '/api/media/MEDIA-33WDWOA0P', 1, '2026-09-03 10:52:51'),
('PKG-RRI6R3M13', 'ST-KGIZMA8DH', 'Classic Family Portrait Session', 'Classic Family Photo', 6500.00, 60, 15, 'None', 4, '', 'No terms specified.', NULL, 1, '2026-09-02 02:56:03');

-- --------------------------------------------------------

--
-- Table structure for table `payments`
--

CREATE TABLE `payments` (
  `id` varchar(50) NOT NULL,
  `gcash_session_id` varchar(50) DEFAULT NULL,
  `booking_id` varchar(50) NOT NULL,
  `studio_id` varchar(50) NOT NULL,
  `customer_id` varchar(50) NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `payment_type` varchar(30) NOT NULL DEFAULT 'Downpayment',
  `payment_method` varchar(50) NOT NULL,
  `payment_status` varchar(50) NOT NULL,
  `proof_of_payment` text DEFAULT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `gateway_transaction_id` varchar(255) DEFAULT NULL,
  `fraud_score` int(11) DEFAULT NULL,
  `payment_channel` varchar(50) NOT NULL DEFAULT 'manual_upload',
  `payment_date` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `reviewed_by` varchar(50) DEFAULT NULL,
  `reviewed_at` timestamp NULL DEFAULT NULL,
  `rejection_reason` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `normalized_reference` varchar(100) DEFAULT NULL,
  `submitted_amount` decimal(12,2) DEFAULT NULL,
  `submitted_at` timestamp NULL DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payment_intents`
--

CREATE TABLE `payment_intents` (
  `id` varchar(50) NOT NULL,
  `public_payment_id` varchar(60) NOT NULL,
  `booking_id` varchar(50) NOT NULL,
  `tenant_id` varchar(50) NOT NULL,
  `customer_id` varchar(50) NOT NULL,
  `payment_type` varchar(30) NOT NULL DEFAULT 'DOWNPAYMENT',
  `expected_amount` decimal(12,2) NOT NULL,
  `currency` char(3) NOT NULL DEFAULT 'PHP',
  `status` varchar(30) NOT NULL DEFAULT 'AWAITING_PAYMENT',
  `expires_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payment_ledger`
--

CREATE TABLE `payment_ledger` (
  `id` varchar(50) NOT NULL,
  `booking_id` varchar(50) NOT NULL,
  `tenant_id` varchar(50) NOT NULL,
  `payment_id` varchar(50) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `payment_type` varchar(30) NOT NULL,
  `status` varchar(30) NOT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `verified_by` varchar(50) DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payment_receipts`
--

CREATE TABLE `payment_receipts` (
  `id` varchar(50) NOT NULL,
  `receipt_number` varchar(60) NOT NULL,
  `booking_id` varchar(50) NOT NULL,
  `tenant_id` varchar(50) NOT NULL,
  `payment_id` varchar(50) NOT NULL,
  `amount` decimal(12,2) NOT NULL,
  `status` varchar(30) NOT NULL DEFAULT 'PAYMENT_VERIFIED',
  `verified_by` varchar(50) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `payment_verifications`
--

CREATE TABLE `payment_verifications` (
  `id` varchar(50) NOT NULL,
  `payment_id` varchar(50) NOT NULL,
  `tenant_id` varchar(50) NOT NULL,
  `verified_by` varchar(50) NOT NULL,
  `verification_method` varchar(60) NOT NULL,
  `reference_checked` tinyint(1) NOT NULL DEFAULT 0,
  `amount_checked` tinyint(1) NOT NULL DEFAULT 0,
  `merchant_checked` tinyint(1) NOT NULL DEFAULT 0,
  `transaction_date_checked` tinyint(1) NOT NULL DEFAULT 0,
  `actual_transaction_confirmed` tinyint(1) NOT NULL DEFAULT 0,
  `verification_notes` text DEFAULT NULL,
  `decision` varchar(20) NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `photo_proofings`
--

CREATE TABLE `photo_proofings` (
  `id` varchar(50) NOT NULL,
  `booking_id` varchar(50) NOT NULL,
  `studio_id` varchar(50) NOT NULL,
  `customer_id` varchar(50) NOT NULL,
  `photos` text NOT NULL,
  `watermark_text` varchar(100) NOT NULL,
  `watermark_position` varchar(50) DEFAULT 'center',
  `watermark_opacity` decimal(3,2) DEFAULT 0.40,
  `final_drive_link` text DEFAULT NULL,
  `status` varchar(50) DEFAULT 'draft',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `print_orders`
--

CREATE TABLE `print_orders` (
  `id` varchar(50) NOT NULL,
  `gcash_session_id` varchar(50) DEFAULT NULL,
  `studio_id` varchar(50) NOT NULL,
  `customer_id` varchar(50) NOT NULL,
  `product_id` varchar(50) NOT NULL,
  `quantity` int(11) DEFAULT 1,
  `uploaded_photo` text NOT NULL,
  `status` varchar(50) NOT NULL DEFAULT 'Pending',
  `total_amount` decimal(10,2) NOT NULL,
  `payment_method` varchar(50) NOT NULL,
  `payment_status` varchar(50) NOT NULL DEFAULT 'Unpaid',
  `proof_of_payment` text DEFAULT NULL,
  `reference_number` varchar(100) DEFAULT NULL,
  `gateway_transaction_id` varchar(255) DEFAULT NULL,
  `shipping_address` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `print_orders`
--

INSERT INTO `print_orders` (`id`, `gcash_session_id`, `studio_id`, `customer_id`, `product_id`, `quantity`, `uploaded_photo`, `status`, `total_amount`, `payment_method`, `payment_status`, `proof_of_payment`, `reference_number`, `gateway_transaction_id`, `shipping_address`, `created_at`) VALUES
('PR-2026-DP025CHU3', NULL, 'ST-89X4NQ5QF', 'CUST-KTRD1KJP1', 'PRD-95BRJSN9L', 1, '/api/media/MEDIA-HECWHHQLF', 'Completed', 150.00, 'GCash', 'Paid', '/api/media/MEDIA-8ATTMRN66', '837438274421094', NULL, NULL, '2026-09-04 13:06:10');

-- --------------------------------------------------------

--
-- Table structure for table `print_products`
--

CREATE TABLE `print_products` (
  `id` varchar(50) NOT NULL,
  `studio_id` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text NOT NULL,
  `size` varchar(50) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `image` varchar(255) NOT NULL,
  `in_stock` tinyint(1) DEFAULT 1,
  `estimated_hours` int(11) DEFAULT 24,
  `is_active` tinyint(1) DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `print_products`
--

INSERT INTO `print_products` (`id`, `studio_id`, `name`, `description`, `size`, `price`, `image`, `in_stock`, `estimated_hours`, `is_active`, `created_at`) VALUES
('PRD-95BRJSN9L', 'ST-89X4NQ5QF', '5R Photos Print', 'High Resolution 2 copy', '8x10 inches', 150.00, '/api/media/MEDIA-UVG5VTZA3', 1, 1, 1, '2026-09-04 13:00:48'),
('PRD-C12VWIX50', 'ST-89X4NQ5QF', '5R Photos Print', 'High Resolution 2 copy', '8x10 inches', 150.00, '/api/media/MEDIA-KWEDENT2N', 1, 1, 0, '2026-09-04 13:00:50');

-- --------------------------------------------------------

--
-- Table structure for table `reviews`
--

CREATE TABLE `reviews` (
  `id` varchar(50) NOT NULL,
  `studio_id` varchar(50) NOT NULL,
  `customer_id` varchar(50) NOT NULL,
  `customer_name` varchar(100) NOT NULL,
  `booking_id` varchar(50) NOT NULL,
  `rating` int(11) DEFAULT NULL CHECK (`rating` >= 1 and `rating` <= 5),
  `comment` text NOT NULL,
  `status` varchar(50) DEFAULT 'pending',
  `reply` text DEFAULT NULL,
  `reply_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `services`
--

CREATE TABLE `services` (
  `id` varchar(50) NOT NULL,
  `studio_id` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` text NOT NULL,
  `category` varchar(100) NOT NULL,
  `base_price` decimal(10,2) NOT NULL,
  `duration_minutes` int(11) NOT NULL,
  `image` varchar(255) DEFAULT NULL,
  `is_active` tinyint(1) DEFAULT 1,
  `available_days` text NOT NULL,
  `available_slots` text NOT NULL,
  `requirements` text NOT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `services`
--

INSERT INTO `services` (`id`, `studio_id`, `name`, `description`, `category`, `base_price`, `duration_minutes`, `image`, `is_active`, `available_days`, `available_slots`, `requirements`, `created_at`) VALUES
('SRV-7P1C113GE', 'ST-89X4NQ5QF', 'Basic Graduation', '1 toga portrait, 1 formal portrait, 2 pcs 5R prints, digital copy', 'Graduation Shoots', 500.00, 30, '[\"/api/media/MEDIA-XQP0C98L4\"]', 1, 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday', '09:00 AM,10:30 AM,01:00 PM,02:30 PM,04:00 PM', 'Arrive 10 minutes early', '2026-09-03 10:54:14'),
('SRV-BRH6KRWP8', 'ST-KGIZMA8DH', ' Family Portrait Session', 'Family photo session ', 'Portrait Photography', 2500.00, 60, '[\"/api/media/MEDIA-5XM5XMCL1\"]', 1, 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday', '09:00 AM,10:30 AM,01:00 PM,02:30 PM,04:00 PM', 'Arrive 10 minutes early', '2026-09-02 02:54:57'),
('SRV-TKZRL8LJJ', 'ST-KGIZMA8DH', 'Passport picture', 'A professional passport-style headshot of a young Asian man facing directly toward the camera with a neutral and natural facial expression. He has neatly styled short black hair, dark eyes, well-groomed eyebrows, and a clean, natural appearance. He is wearing a black formal suit, white collared shirt, and black necktie. The subject is centered in the frame with the head and shoulders fully visible, looking straight ahead.', 'Portrait Photography', 10.00, 60, '[\"/api/media/MEDIA-X90Z32UCE\"]', 1, 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday', '09:00 AM,10:30 AM,01:00 PM,02:30 PM,04:00 PM', 'Arrive 10 minutes early', '2026-09-03 06:34:50');

-- --------------------------------------------------------

--
-- Table structure for table `studios`
--

CREATE TABLE `studios` (
  `id` varchar(50) NOT NULL,
  `name` varchar(100) NOT NULL,
  `owner_id` varchar(50) NOT NULL,
  `logo` varchar(255) NOT NULL,
  `cover_image` varchar(255) NOT NULL,
  `location` varchar(150) NOT NULL,
  `rating` decimal(3,2) DEFAULT 0.00,
  `review_count` int(11) DEFAULT 0,
  `starting_price` decimal(10,2) DEFAULT 0.00,
  `categories` text NOT NULL,
  `description` text NOT NULL,
  `address` varchar(255) NOT NULL,
  `contact_info` varchar(50) NOT NULL,
  `email` varchar(100) NOT NULL,
  `business_hours` varchar(100) NOT NULL,
  `is_approved` tinyint(1) DEFAULT 0,
  `status` varchar(50) DEFAULT 'pending',
  `printing_available` tinyint(1) DEFAULT 0,
  `latitude` decimal(10,6) DEFAULT NULL,
  `longitude` decimal(10,6) DEFAULT NULL,
  `business_permit` longtext DEFAULT NULL,
  `valid_id` longtext DEFAULT NULL,
  `other_docs` longtext DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `registered_by_admin` tinyint(1) DEFAULT 0,
  `blocked_dates` text DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `studios`
--

INSERT INTO `studios` (`id`, `name`, `owner_id`, `logo`, `cover_image`, `location`, `rating`, `review_count`, `starting_price`, `categories`, `description`, `address`, `contact_info`, `email`, `business_hours`, `is_approved`, `status`, `printing_available`, `latitude`, `longitude`, `business_permit`, `valid_id`, `other_docs`, `created_at`, `registered_by_admin`, `blocked_dates`) VALUES
('ST-89X4NQ5QF', 'EverGrad Photography', 'U-6EPTFFF2F', '/api/media/MEDIA-15AN1YTO2', '/api/media/MEDIA-9V18MOK2N', 'Camia Street, De Castro, Santa Lucia, Pasig Second District, パシッグ, Eastern Manila District, Metro Manila, 1608, Philippines', 5.00, 0, 500.00, 'Graduation Shoots', 'Welcome to our newly registered photography studio! Complete our profile setup to list services, customizable packages, and receive instant bookings.', 'Camia Street, De Castro, Santa Lucia, Pasig Second District, パシッグ, Eastern Manila District, Metro Manila, 1608, Philippines', '09618704213', 'reynaldoesteban899@gmail.com', '09:00 AM - 06:00 PM', 1, 'approved', 1, 14.587831, 121.100197, '/api/media/MEDIA-S9P465XKJ', '/api/media/MEDIA-LQKL6U0XF', NULL, '2026-09-03 10:48:22', 0, ''),
('ST-KGIZMA8DH', 'Ellamaephotstudio', 'U-4IGCHF41A', '/api/media/MEDIA-X4YWM7X5P', '/api/media/MEDIA-KBTH49SEP', 'Sunrise Executive Subdivision, Santo Domingo, Cainta, Rizal, Calabarzon, 1900, Philippines', 5.00, 1, 1000.00, 'Portrait Photography', 'Welcome to our newly registered photography studio! Complete our profile setup to list services, customizable packages, and receive instant bookings.', 'Sunrise Executive Subdivision, Santo Domingo, Cainta, Rizal, Calabarzon, 1900, Philippines', '0985545423', 'maelucanas05@gmail.com', '09:00 AM - 06:00 PM', 1, 'approved', 1, 14.582885, 121.118514, '/api/media/MEDIA-JQF6AHC7M', '/api/media/MEDIA-YJI0FW35G', '/api/media/MEDIA-J7E1TA6MZ', '2026-09-02 02:46:37', 0, '');

-- --------------------------------------------------------

--
-- Table structure for table `studio_payment_credentials`
--

CREATE TABLE `studio_payment_credentials` (
  `id` varchar(50) NOT NULL,
  `studio_id` varchar(50) NOT NULL,
  `gateway` varchar(20) NOT NULL DEFAULT 'paymongo',
  `gateway_sub_account_id` varchar(255) DEFAULT NULL,
  `public_key_encrypted` text DEFAULT NULL,
  `secret_key_encrypted` text DEFAULT NULL,
  `webhook_secret_encrypted` text DEFAULT NULL,
  `gcash_merchant_name` varchar(100) DEFAULT NULL,
  `gcash_number` varchar(20) DEFAULT NULL,
  `is_live_mode` tinyint(1) NOT NULL DEFAULT 0,
  `is_enabled` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tenant_payment_methods`
--

CREATE TABLE `tenant_payment_methods` (
  `id` varchar(50) NOT NULL,
  `tenant_id` varchar(50) NOT NULL,
  `provider` varchar(30) NOT NULL DEFAULT 'GCASH',
  `method_type` varchar(40) NOT NULL DEFAULT 'DIGITAL_QR',
  `merchant_name` varchar(150) NOT NULL,
  `merchant_account_identifier` varchar(150) DEFAULT NULL,
  `qr_image_path` varchar(255) DEFAULT NULL,
  `instructions` text DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT 1,
  `is_default` tinyint(1) NOT NULL DEFAULT 0,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `updated_at` timestamp NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `users`
--

CREATE TABLE `users` (
  `id` varchar(50) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password_hash` varchar(255) NOT NULL,
  `full_name` varchar(100) NOT NULL,
  `role` varchar(50) NOT NULL,
  `studio_id` varchar(50) DEFAULT NULL,
  `contact_number` varchar(50) DEFAULT NULL,
  `address` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `users`
--

INSERT INTO `users` (`id`, `email`, `password_hash`, `full_name`, `role`, `studio_id`, `contact_number`, `address`, `created_at`) VALUES
('STAFF-KBSLCTBIS', 'christiandelossantos0315@gmail.com', '$2b$10$Wza.mcj4t0.c0lRxoGiDqOC4nYP2WpATD5XVh5W/2yEhc7Zpv45ku', 'Rey Esteban', 'STUDIO_STAFF', 'ST-KGIZMA8DH', '09840394667', NULL, '2026-09-02 03:06:07'),
('U-4IGCHF41A', 'maelucanas05@gmail.com', '$2b$10$zOzsjHx9CV7SXh6MbppL/eFLKadbinNpP6stA5ufFrDPPJ0c3.M8u', 'Ellamae Monteza lucañas', 'STUDIO_ADMIN', 'ST-KGIZMA8DH', '0985545423', NULL, '2026-09-02 02:46:37'),
('U-6EPTFFF2F', 'reynaldoesteban899@gmail.com', '$2b$10$6GmHKIKFsN11RLf9FPO1kuBp1gvTheRc0RfUg7oHyaj0uOA3Rw6sO', 'Martha dela cruz', 'STUDIO_ADMIN', 'ST-89X4NQ5QF', '09618704213', 'Cainta Rizal', '2026-09-03 10:48:22'),
('u-superadmin', 'admin@caintaphotography.com', '$2b$10$KWzQUkhlejbbjajhZZSS3ONo1.Onq8MCGV6FDtQ1vWrH9TsHW7D6G', 'System Super Admin', 'SUPER_ADMIN', NULL, '+63 900 000 0000', 'Cainta Municipal Hall, Rizal', '2025-12-31 16:00:00');

-- --------------------------------------------------------

--
-- Table structure for table `webhook_events`
--

CREATE TABLE `webhook_events` (
  `event_id` varchar(255) NOT NULL,
  `gateway` varchar(20) NOT NULL,
  `event_type` varchar(100) NOT NULL,
  `payment_id` varchar(50) DEFAULT NULL,
  `session_id` varchar(50) DEFAULT NULL,
  `raw_payload` mediumtext DEFAULT NULL,
  `processed_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Indexes for dumped tables
--

--
-- Indexes for table `addons`
--
ALTER TABLE `addons`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_addons_studio` (`studio_id`);

--
-- Indexes for table `audit_logs`
--
ALTER TABLE `audit_logs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_audit_logs_timestamp` (`timestamp`);

--
-- Indexes for table `bookings`
--
ALTER TABLE `bookings`
  ADD PRIMARY KEY (`id`),
  ADD KEY `studio_id` (`studio_id`),
  ADD KEY `service_id` (`service_id`),
  ADD KEY `package_id` (`package_id`),
  ADD KEY `idx_bookings_customer` (`customer_id`),
  ADD KEY `idx_bookings_date` (`booking_date`);

--
-- Indexes for table `categories`
--
ALTER TABLE `categories`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `name` (`name`);

--
-- Indexes for table `cms_settings`
--
ALTER TABLE `cms_settings`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `customers`
--
ALTER TABLE `customers`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `idx_customers_email` (`email`);

--
-- Indexes for table `faqs`
--
ALTER TABLE `faqs`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_faqs_studio` (`studio_id`);

--
-- Indexes for table `favorites`
--
ALTER TABLE `favorites`
  ADD PRIMARY KEY (`id`),
  ADD KEY `customer_id` (`customer_id`),
  ADD KEY `studio_id` (`studio_id`);

--
-- Indexes for table `gcash_qr_sessions`
--
ALTER TABLE `gcash_qr_sessions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_gcash_sessions_booking` (`booking_id`),
  ADD KEY `idx_gcash_sessions_customer` (`customer_id`),
  ADD KEY `idx_gcash_sessions_intent` (`gateway_payment_intent_id`),
  ADD KEY `idx_gcash_sessions_status` (`status`);

--
-- Indexes for table `media_files`
--
ALTER TABLE `media_files`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `storage_key` (`storage_key`),
  ADD KEY `media_files_entity_idx` (`entity_type`,`entity_id`),
  ADD KEY `media_files_owner_idx` (`owner_id`),
  ADD KEY `media_files_purpose_idx` (`purpose`);

--
-- Indexes for table `notifications`
--
ALTER TABLE `notifications`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_notifications_unread` (`user_id`,`is_read`);

--
-- Indexes for table `packages`
--
ALTER TABLE `packages`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_packages_studio` (`studio_id`);

--
-- Indexes for table `payments`
--
ALTER TABLE `payments`
  ADD PRIMARY KEY (`id`),
  ADD KEY `studio_id` (`studio_id`),
  ADD KEY `customer_id` (`customer_id`),
  ADD KEY `idx_payments_booking` (`booking_id`);

--
-- Indexes for table `payment_intents`
--
ALTER TABLE `payment_intents`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `public_payment_id` (`public_payment_id`);

--
-- Indexes for table `payment_ledger`
--
ALTER TABLE `payment_ledger`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `payment_id` (`payment_id`);

--
-- Indexes for table `payment_receipts`
--
ALTER TABLE `payment_receipts`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `receipt_number` (`receipt_number`),
  ADD UNIQUE KEY `payment_id` (`payment_id`);

--
-- Indexes for table `payment_verifications`
--
ALTER TABLE `payment_verifications`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `payment_verifications_approved_uq` (`payment_id`,`decision`);

--
-- Indexes for table `photo_proofings`
--
ALTER TABLE `photo_proofings`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `booking_id` (`booking_id`),
  ADD KEY `studio_id` (`studio_id`),
  ADD KEY `customer_id` (`customer_id`);

--
-- Indexes for table `print_orders`
--
ALTER TABLE `print_orders`
  ADD PRIMARY KEY (`id`),
  ADD KEY `studio_id` (`studio_id`),
  ADD KEY `customer_id` (`customer_id`),
  ADD KEY `product_id` (`product_id`),
  ADD KEY `idx_print_orders_status` (`status`);

--
-- Indexes for table `print_products`
--
ALTER TABLE `print_products`
  ADD PRIMARY KEY (`id`),
  ADD KEY `studio_id` (`studio_id`);

--
-- Indexes for table `reviews`
--
ALTER TABLE `reviews`
  ADD PRIMARY KEY (`id`),
  ADD KEY `studio_id` (`studio_id`),
  ADD KEY `booking_id` (`booking_id`),
  ADD KEY `idx_reviews_customer` (`customer_id`),
  ADD KEY `idx_reviews_rating` (`rating`);

--
-- Indexes for table `services`
--
ALTER TABLE `services`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_services_studio` (`studio_id`);

--
-- Indexes for table `studios`
--
ALTER TABLE `studios`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_studios_owner` (`owner_id`);

--
-- Indexes for table `studio_payment_credentials`
--
ALTER TABLE `studio_payment_credentials`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uniq_studio_payment_creds` (`studio_id`,`gateway`);

--
-- Indexes for table `tenant_payment_methods`
--
ALTER TABLE `tenant_payment_methods`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`),
  ADD KEY `idx_users_role` (`role`);

--
-- Indexes for table `webhook_events`
--
ALTER TABLE `webhook_events`
  ADD PRIMARY KEY (`event_id`),
  ADD KEY `idx_webhook_events_payment` (`payment_id`),
  ADD KEY `idx_webhook_events_processed` (`processed_at`);

--
-- Constraints for dumped tables
--

--
-- Constraints for table `addons`
--
ALTER TABLE `addons`
  ADD CONSTRAINT `addons_ibfk_1` FOREIGN KEY (`studio_id`) REFERENCES `studios` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `bookings`
--
ALTER TABLE `bookings`
  ADD CONSTRAINT `bookings_ibfk_1` FOREIGN KEY (`studio_id`) REFERENCES `studios` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `bookings_ibfk_2` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `bookings_ibfk_3` FOREIGN KEY (`service_id`) REFERENCES `services` (`id`),
  ADD CONSTRAINT `bookings_ibfk_4` FOREIGN KEY (`package_id`) REFERENCES `packages` (`id`);

--
-- Constraints for table `favorites`
--
ALTER TABLE `favorites`
  ADD CONSTRAINT `favorites_ibfk_1` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `favorites_ibfk_2` FOREIGN KEY (`studio_id`) REFERENCES `studios` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `packages`
--
ALTER TABLE `packages`
  ADD CONSTRAINT `packages_ibfk_1` FOREIGN KEY (`studio_id`) REFERENCES `studios` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `payments`
--
ALTER TABLE `payments`
  ADD CONSTRAINT `payments_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `payments_ibfk_2` FOREIGN KEY (`studio_id`) REFERENCES `studios` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `payments_ibfk_3` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `photo_proofings`
--
ALTER TABLE `photo_proofings`
  ADD CONSTRAINT `photo_proofings_ibfk_1` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `photo_proofings_ibfk_2` FOREIGN KEY (`studio_id`) REFERENCES `studios` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `photo_proofings_ibfk_3` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `print_orders`
--
ALTER TABLE `print_orders`
  ADD CONSTRAINT `print_orders_ibfk_1` FOREIGN KEY (`studio_id`) REFERENCES `studios` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `print_orders_ibfk_2` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `print_orders_ibfk_3` FOREIGN KEY (`product_id`) REFERENCES `print_products` (`id`);

--
-- Constraints for table `print_products`
--
ALTER TABLE `print_products`
  ADD CONSTRAINT `print_products_ibfk_1` FOREIGN KEY (`studio_id`) REFERENCES `studios` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `reviews`
--
ALTER TABLE `reviews`
  ADD CONSTRAINT `reviews_ibfk_1` FOREIGN KEY (`studio_id`) REFERENCES `studios` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `reviews_ibfk_2` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `reviews_ibfk_3` FOREIGN KEY (`booking_id`) REFERENCES `bookings` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `services`
--
ALTER TABLE `services`
  ADD CONSTRAINT `services_ibfk_1` FOREIGN KEY (`studio_id`) REFERENCES `studios` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `studios`
--
ALTER TABLE `studios`
  ADD CONSTRAINT `studios_ibfk_1` FOREIGN KEY (`owner_id`) REFERENCES `users` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `studio_payment_credentials`
--
ALTER TABLE `studio_payment_credentials`
  ADD CONSTRAINT `fk_studio_payment_creds_studio` FOREIGN KEY (`studio_id`) REFERENCES `studios` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
