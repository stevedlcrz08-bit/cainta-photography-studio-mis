import React, { useState } from "react";
import { 
  Camera, Calendar, ShieldCheck, Mail, Phone, MapPin, 
  Clock, Heart, Star, Sparkles, Image as ImageIcon, Printer, User, MessageSquare, Compass,
  X, Eye, Layers, Info
} from "lucide-react";
import { motion } from "motion/react";
import { Interactive3DTiltCard, MagnetButton } from "../components/MotionCard.tsx";
import CaintaStudioMap from "../components/CaintaStudioMap.tsx";

interface StudioProfileProps {
  studio: any;
  services: any[];
  packages: any[];
  addons: any[];
  reviews: any[];
  printProducts: any[];
  favorites: any[];
  onToggleFavorite: (studioId: string) => void;
  onOpenBookingWizard: () => void;
  onOpenPrintWizard: () => void;
}

export default function StudioProfile({
  studio,
  services,
  packages,
  addons,
  reviews,
  printProducts,
  favorites,
  onToggleFavorite,
  onOpenBookingWizard,
  onOpenPrintWizard
}: StudioProfileProps) {
  const [activeTab, setActiveTab] = useState<"services" | "packages" | "prints" | "reviews">("services");
  const isFav = favorites.some(f => f.studioId === studio.id);

  const [isExamplePrintsOpen, setIsExamplePrintsOpen] = useState(false);
  const [selectedProj, setSelectedProj] = useState(0);
  const [selectedPortfolioImage, setSelectedPortfolioImage] = useState<string | null>(null);

  const pastPrintProjects = printProducts
    .filter(product => product.isActive !== false && (product.images?.[0] || product.image))
    .map(product => ({
      title: product.name,
      category: "Print Product",
      description: product.description || "Studio print product available for custom orders.",
      material: product.description || "Studio print product",
      dimensions: product.size,
      image: product.images?.[0] || product.image
    }));

  const galleryImages = [...services, ...packages, ...printProducts]
    .flatMap(item => Array.isArray(item.images) && item.images.length > 0 ? item.images : [item.image])
    .filter((image): image is string => Boolean(image));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-6 sm:space-y-8 pb-24 md:pb-12">
      {/* 1. COVER PHOTO & MAIN HEADER CARD */}
      <div className="bg-white rounded-3xl overflow-hidden border border-[#e5e1da] shadow-lg">
        {/* Cover image */}
        <div className="h-64 sm:h-80 relative bg-gray-100">
          <img src={studio.coverImage} alt={studio.name} className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          
          <button
            onClick={() => onToggleFavorite(studio.id)}
            className="absolute top-5 right-5 p-2 rounded-full bg-white/90 backdrop-blur-sm text-gray-500 hover:text-red-500 transition-colors shadow-md cursor-pointer"
            title="Add to Favorites"
          >
            <Heart size={20} className={isFav ? "fill-red-500 text-red-500" : ""} />
          </button>

          {/* Overlaid Title & Badges */}
          <div className="absolute bottom-6 left-6 text-left text-white space-y-2 pr-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] bg-yellow-500 text-black font-extrabold uppercase px-2 py-0.5 rounded tracking-wider shadow-sm">
                Studio Profile
              </span>
              {studio.isApproved && (
                <span className="text-[10px] bg-green-600 text-white font-bold px-2 py-0.5 rounded flex items-center gap-0.5 shadow-sm">
                  <ShieldCheck size={11} /> Verified Partner
                </span>
              )}
            </div>
            <h1 className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight leading-none text-white">
              {studio.name}
            </h1>
            <p className="text-xs text-gray-200 flex items-center gap-1 font-semibold leading-relaxed">
              <MapPin size={13} className="text-yellow-500" /> {studio.location}
            </p>
          </div>
        </div>

        {/* Studio Bio / Description */}
        <div className="p-6 sm:p-8 grid md:grid-cols-12 gap-8 text-left">
          <div className="md:col-span-8 space-y-4">
            <h3 className="font-display text-lg font-bold text-[#2c2a29]">About our Creative Studio</h3>
            <p className="text-xs sm:text-sm text-[#7c756d] leading-relaxed font-light">{studio.description}</p>
            
            {/* Gallery portfolio Grid */}
            <div className="space-y-2 pt-2">
              <h4 className="font-semibold text-xs text-[#2c2a29] flex items-center gap-1">
                <ImageIcon size={14} /> Portfolio Preview
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {galleryImages.map((img, i) => (
                  <button
                    key={`${img}-${i}`}
                    type="button"
                    onClick={() => setSelectedPortfolioImage(img)}
                    className="aspect-square rounded-xl overflow-hidden bg-[#f3f1ed] group cursor-zoom-in relative border border-[#e5e1da]"
                    aria-label={`View portfolio photo ${i + 1}`}
                  >
                    <img src={img} alt={`Portfolio photo ${i + 1}`} className="w-full h-full object-contain group-hover:scale-105 transition-transform" />
                    <span className="absolute inset-x-0 bottom-0 bg-black/55 text-white text-[9px] font-bold uppercase tracking-wider py-1 opacity-0 group-hover:opacity-100 transition-opacity">View full image</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Quick contact and hours panel */}
          <div className="md:col-span-4 bg-[#faf9f6] border border-[#e5e1da] rounded-2xl p-5 space-y-4 text-xs font-semibold text-[#2c2a29]">
            <h4 className="font-display text-sm font-bold border-b border-gray-100 pb-2">Business Information</h4>
            <div className="space-y-3">
              <p className="flex items-center gap-2"><Clock size={15} className="text-[#7c756d]" /> {studio.businessHours}</p>
              <p className="flex items-center gap-2"><Phone size={15} className="text-[#7c756d]" /> {studio.contactInfo}</p>
              <p className="flex items-center gap-2"><Mail size={15} className="text-[#7c756d]" /> {studio.email}</p>
              <p className="flex items-start gap-2 leading-tight">
                <MapPin size={15} className="text-[#7c756d] mt-0.5 flex-shrink-0" /> 
                <span className="text-[#7c756d] text-[11px] font-normal">{studio.address}</span>
              </p>
            </div>

            {/* Direct primary action buttons */}
            <div className="pt-3 space-y-2">
              <MagnetButton
                onClick={onOpenBookingWizard}
                className="w-full py-3 bg-[#2c2a29] text-[#faf9f6] hover:bg-[#4a4644] font-bold rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider font-bold"
              >
                <Calendar size={15} /> Book Appointment
              </MagnetButton>

              {studio.printingAvailable && (
                <>
                  <MagnetButton
                    onClick={onOpenPrintWizard}
                    className="w-full py-2.5 bg-yellow-500 text-black hover:bg-yellow-400 font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer text-[11px] uppercase tracking-wider font-bold"
                  >
                    <Printer size={15} /> Order Custom Prints
                  </MagnetButton>
                  
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedProj(0);
                      setIsExamplePrintsOpen(true);
                    }}
                    className="w-full py-2 bg-white hover:bg-gray-50 text-[#2c2a29] border border-[#e5e1da] hover:border-[#2c2a29] text-[10px] uppercase tracking-wider font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <ImageIcon size={13} /> View Past Print Gallery
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {selectedPortfolioImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 p-4 sm:p-8 flex items-center justify-center"
          role="dialog"
          aria-modal="true"
          aria-label="Portfolio image preview"
          onClick={() => setSelectedPortfolioImage(null)}
        >
          <button
            type="button"
            onClick={() => setSelectedPortfolioImage(null)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white text-[#2c2a29] shadow-lg cursor-pointer"
            aria-label="Close portfolio preview"
          >
            <X size={20} />
          </button>
          <img
            src={selectedPortfolioImage}
            alt="Full portfolio preview"
            className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* STUDIO CAINTA LEAFLET LOCATION MAP */}
      <div className="space-y-3 text-left">
        <div className="flex items-center gap-2">
          <Compass className="text-yellow-600" size={18} />
          <h3 className="font-display font-bold text-lg text-[#2c2a29]">Studio Location Map (Cainta, Rizal)</h3>
        </div>
        <CaintaStudioMap
          studios={[studio]}
          onNavigate={() => {}}
          selectedStudioId={studio.id}
          height="360px"
        />
      </div>

      {/* 2. TABBED SERVICES, CUSTOM PACKAGES, PRINTS AND REVIEWS */}
      <div className="bg-white rounded-3xl border border-[#e5e1da] shadow-sm overflow-hidden">
        {/* Tab Selection */}
        <div className="bg-gray-50 border-b border-[#e5e1da] flex overflow-x-auto">
          {[
            { id: "services", label: "Photography Services", count: services.length },
            { id: "packages", label: "Customizable Packages", count: packages.length },
            { id: "prints", label: "Printing Shop", count: printProducts.length },
            { id: "reviews", label: "Verified Reviews", count: reviews.length }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`py-4 px-6 font-bold text-xs whitespace-nowrap cursor-pointer border-b-2 transition-all flex items-center gap-2 ${
                activeTab === tab.id 
                  ? "border-[#2c2a29] text-[#2c2a29] bg-white" 
                  : "border-transparent text-[#7c756d] hover:text-[#2c2a29]"
              }`}
            >
              {tab.label}
              <span className="text-[10px] bg-gray-200 text-[#7c756d] px-1.5 py-0.5 rounded-full font-semibold">{tab.count}</span>
            </button>
          ))}
        </div>

        {/* Tab Content Display */}
        <div className="p-6 text-left">
          {/* A. Services Tab */}
          {activeTab === "services" && (
            <div className="grid sm:grid-cols-2 gap-6">
              {services.map((srv) => (
                <Interactive3DTiltCard 
                  key={srv.id} 
                  className="bg-[#faf9f6] border border-[#e5e1da] p-4 rounded-2xl flex flex-row gap-4 w-full h-full"
                >
                  <div className="w-20 flex-shrink-0 space-y-1">
                    <img src={(srv.images?.[0] || srv.image)} alt={srv.name} className="w-20 h-20 rounded-xl object-cover" />
                    {Array.isArray(srv.images) && srv.images.length > 1 && (
                      <div className="grid grid-cols-3 gap-1">
                        {srv.images.slice(1, 4).map((image: string, index: number) => (
                          <img key={`${image.slice(0, 24)}-${index}`} src={image} alt={`${srv.name} sample ${index + 2}`} className="w-6 h-6 rounded object-cover" />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-1 text-left flex-1">
                    <h4 className="font-display font-bold text-sm text-[#2c2a29]">{srv.name}</h4>
                    <p className="text-[11px] text-[#7c756d] leading-relaxed line-clamp-2">{srv.description}</p>
                    <div className="flex flex-wrap gap-4 pt-1 text-[10px] text-[#7c756d] font-semibold">
                      <span>Base Rate: <strong className="text-[#2c2a29]">{srv.basePrice} PHP</strong></span>
                      <span>•</span>
                      <span>Duration: {srv.durationMinutes} mins</span>
                    </div>
                  </div>
                </Interactive3DTiltCard>
              ))}
            </div>
          )}

          {/* B. Packages Tab */}
          {activeTab === "packages" && (
            <div className="grid sm:grid-cols-2 gap-6">
              {packages.map((pkg) => (
                <Interactive3DTiltCard 
                  key={pkg.id} 
                  className="bg-[#faf9f6] border border-[#e5e1da] p-5 rounded-2xl flex flex-col justify-between space-y-4 w-full h-full"
                >
                  <div className="flex gap-4">
                    <img src={pkg.image} alt={pkg.name} className="w-16 h-16 rounded-xl object-cover flex-shrink-0" />
                    <div className="space-y-1 text-left flex-1">
                      <h4 className="font-display font-bold text-sm text-[#2c2a29]">{pkg.name}</h4>
                      <p className="text-[11px] text-[#7c756d] line-clamp-2">{pkg.description}</p>
                      <p className="text-xs font-bold text-[#2c2a29]">{pkg.price} PHP</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px] text-[#7c756d] pt-3 border-t border-dashed border-[#e5e1da] font-medium text-left">
                    <div>• Edited photos: {pkg.editedPhotosCount}</div>
                    <div>• Included Prints: {pkg.includedPrints}</div>
                    <div className="col-span-2">• Photographer count: {pkg.photographerCount} staff</div>
                  </div>
                </Interactive3DTiltCard>
              ))}
            </div>
          )}

          {/* C. Printing Shop Tab */}
          {activeTab === "prints" && (
            <div>
              {!studio.printingAvailable ? (
                <div className="py-8 text-center text-xs text-[#7c756d]">Printing products are not configured for this studio.</div>
              ) : (
                <div className="space-y-6">
                  {/* Premium physical gallery showcase invitation banner */}
                  <div className="bg-[#faf9f6] border border-[#e5e1da] rounded-2xl p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-xs">
                    <div className="space-y-0.5 text-left">
                      <h4 className="font-bold text-[#2c2a29] flex items-center gap-1">
                        <Sparkles size={14} className="text-yellow-600 fill-current" /> Premium Past Physical Print Showcase
                      </h4>
                      <p className="text-[11px] text-[#7c756d] leading-relaxed">
                        Curious about our final printed product quality, paper texture, and framing finishes? Explore our high-definition gallery of real past work.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsExamplePrintsOpen(true)}
                      className="py-2 px-4 bg-[#2c2a29] hover:bg-black text-[#faf9f6] rounded-xl text-[10px] font-bold uppercase tracking-wider cursor-pointer whitespace-nowrap flex items-center gap-1.5 shadow-sm transition-colors"
                    >
                      <ImageIcon size={13} /> Open Visual Showcase
                    </button>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-4">
                  {printProducts.map((prod) => (
                    <Interactive3DTiltCard 
                      key={prod.id} 
                      className="bg-[#faf9f6] border border-[#e5e1da] p-4 rounded-xl flex flex-col justify-between text-left space-y-3 w-full h-full"
                    >
                      <div className="space-y-2">
                        <img src={prod.images?.[0] || prod.image} alt={prod.name} className="w-full h-28 rounded-lg object-cover" />
                        {prod.images && prod.images.length > 1 && (
                          <div className="flex gap-1 overflow-hidden">
                            {prod.images.slice(1, 4).map((image: string, index: number) => (
                              <img key={`${image}-${index}`} src={image} alt={`${prod.name} detail ${index + 2}`} className="h-8 w-8 rounded object-cover" />
                            ))}
                          </div>
                        )}
                        <h4 className="font-semibold text-xs text-[#2c2a29] line-clamp-1">{prod.name}</h4>
                        <p className="text-[10px] text-[#7c756d] line-clamp-1">{prod.description}</p>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t border-[#faf9f6] text-[10px] font-bold text-[#2c2a29]">
                        <span>Price: {prod.price} PHP</span>
                        <span className="text-[9px] uppercase tracking-wider bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded font-bold">
                          {prod.size}
                        </span>
                      </div>
                    </Interactive3DTiltCard>
                  ))}
                </div>
              </div>
              )}
            </div>
          )}

          {/* D. Verified Reviews Tab */}
          {activeTab === "reviews" && (
            <div className="space-y-4">
              {(() => {
                const approvedReviews = reviews.filter(r => r.status === "approved");
                return approvedReviews.length === 0 ? (
                  <div className="py-8 text-center text-xs text-[#7c756d]">No verified reviews listed yet. Complete a booking to provide feedback!</div>
                ) : (
                  <div className="grid gap-4">
                    {approvedReviews.map((rev) => (
                      <div key={rev.id} className="bg-[#faf9f6] border border-[#e5e1da] p-5 rounded-2xl space-y-2">
                        <div className="flex justify-between items-center text-xs font-semibold text-[#2c2a29]">
                          <span className="flex items-center gap-1 font-bold">
                            <User size={14} className="text-[#7c756d]" /> {rev.customerName}
                          </span>
                          <span className="text-[10px] text-[#7c756d]">{new Date(rev.createdAt).toLocaleDateString()}</span>
                        </div>
                        <div className="flex gap-1 text-yellow-500">
                          {[...Array(rev.rating)].map((_, i) => <Star key={i} size={11} className="fill-current" />)}
                        </div>
                        <p className="text-xs text-[#7c756d] leading-relaxed italic">"{rev.comment}"</p>
                        {/* Studio Owner Reply */}
                        {rev.reply && (
                          <div className="mt-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-2.5 text-xs text-blue-900">
                            <span className="font-bold block text-[10px] uppercase tracking-wider text-blue-500 mb-0.5">Studio Response</span>
                            {rev.reply}
                            {rev.replyAt && <span className="text-[10px] text-blue-400 ml-2">· {new Date(rev.replyAt).toLocaleDateString()}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}

        </div>
      </div>

      {/* 3. EXAMPLE PRINTS PHYSICAL SHOWCASE MODAL */}
      {isExamplePrintsOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-all">
          {/* Main Modal Panel */}
          <div className="bg-[#faf9f6] w-full max-w-5xl rounded-3xl shadow-2xl border border-[#e5e1da] overflow-hidden flex flex-col max-h-[90vh] text-[#2c2a29] text-left">
            
            {/* Header */}
            <div className="p-5 sm:p-6 border-b border-[#e5e1da] flex justify-between items-center bg-white">
              <div className="space-y-0.5">
                <span className="text-[10px] bg-[#2c2a29] text-white font-extrabold uppercase px-2 py-0.5 rounded tracking-wider">
                  Physical Print Showcase
                </span>
                <h3 className="font-display text-lg font-extrabold text-[#2c2a29]">
                  Studio Print Gallery
                </h3>
              </div>
              <button
                onClick={() => setIsExamplePrintsOpen(false)}
                className="p-2 rounded-full hover:bg-gray-100 text-gray-500 hover:text-black cursor-pointer transition-colors"
                title="Close Showcase"
              >
                <X size={18} />
              </button>
            </div>

            {/* Split Screen Content Body */}
            <div className="flex-1 overflow-y-auto grid md:grid-cols-12">
              {pastPrintProjects.length === 0 ? (
                <div className="md:col-span-12 p-12 text-center space-y-3">
                  <ImageIcon size={32} className="mx-auto text-[#7c756d]" />
                  <h4 className="font-display text-lg font-bold">No print gallery items yet</h4>
                  <p className="text-xs text-[#7c756d]">This studio has not published any print products yet.</p>
                </div>
              ) : (
              <>
              
              {/* Left Side: Large HD Image Preview Panel (7 columns) */}
              <div className="md:col-span-7 bg-white p-6 flex flex-col justify-between border-r border-[#e5e1da] space-y-4">
                <div className="space-y-3">
                  <div className="aspect-[4/3] rounded-2xl overflow-hidden bg-[#faf9f6] relative border border-[#e5e1da] group shadow-inner">
                    <img
                      src={pastPrintProjects[selectedProj].image}
                      alt={pastPrintProjects[selectedProj].title}
                      className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                      referrerPolicy="no-referrer"
                    />
                    <span className="absolute bottom-3 left-3 text-[10px] bg-[#2c2a29]/80 backdrop-blur-sm text-white font-bold px-2 py-1 rounded-lg">
                      {pastPrintProjects[selectedProj].category}
                    </span>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-display text-xl font-extrabold text-[#2c2a29]">
                      {pastPrintProjects[selectedProj].title}
                    </h4>
                    <p className="text-xs text-[#7c756d] leading-relaxed font-light">
                      {pastPrintProjects[selectedProj].description}
                    </p>
                  </div>
                </div>

                {/* Print Specs Box */}
                <div className="bg-[#faf9f6] border border-[#e5e1da] p-4 rounded-2xl grid grid-cols-2 gap-4 text-[11px] font-semibold">
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase text-gray-400 font-extrabold tracking-wider flex items-center gap-1">
                      <Layers size={10} /> Fabricated Material
                    </span>
                    <p className="text-[#2c2a29] leading-snug font-medium">
                      {pastPrintProjects[selectedProj].material}
                    </p>
                  </div>
                  <div className="space-y-1">
                    <span className="text-[9px] uppercase text-gray-400 font-extrabold tracking-wider flex items-center gap-1">
                      <Info size={10} /> Aspect Ratio / Size
                    </span>
                    <p className="text-[#2c2a29] leading-snug font-medium">
                      {pastPrintProjects[selectedProj].dimensions}
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Side: Showcase Selectors Panel (5 columns) */}
              <div className="md:col-span-5 p-6 bg-gray-50 flex flex-col justify-between space-y-6">
                <div className="space-y-4">
                  <span className="text-[10px] text-gray-400 font-extrabold uppercase tracking-widest block">
                    Select Print Specimen ({pastPrintProjects.length} Available)
                  </span>
                  
                  <div className="space-y-2.5">
                    {pastPrintProjects.map((proj, idx) => {
                      const isActive = selectedProj === idx;
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedProj(idx)}
                          className={`w-full p-3.5 rounded-2xl border text-left flex gap-3 transition-all cursor-pointer items-center ${
                            isActive
                              ? "bg-white border-[#2c2a29] shadow-md ring-1 ring-[#2c2a29]"
                              : "bg-[#faf9f6] border-[#e5e1da] hover:border-[#7c756d]"
                          }`}
                        >
                          <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 bg-gray-200">
                            <img src={proj.image} alt={proj.title} className="w-full h-full object-cover" />
                          </div>
                          <div className="flex-1 space-y-0.5 min-w-0">
                            <div className="flex justify-between items-center">
                              <span className="text-[9px] font-extrabold uppercase tracking-wider text-yellow-600 bg-yellow-50 px-1 rounded">
                                {proj.category}
                              </span>
                            </div>
                            <h5 className="font-bold text-xs text-[#2c2a29] truncate">
                              {proj.title}
                            </h5>
                            <p className="text-[10px] text-[#7c756d] truncate font-light">
                              {proj.material}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Call to action print launcher */}
                <div className="bg-[#faf9f6] border border-[#e5e1da] p-4 rounded-2xl space-y-2 text-center">
                  <p className="text-[10px] text-[#7c756d]">
                    Ready to turn your high-resolution digital files into real physical specimens?
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setIsExamplePrintsOpen(false);
                      onOpenPrintWizard();
                    }}
                    className="w-full py-2 bg-[#2c2a29] hover:bg-black text-[#faf9f6] text-xs font-bold uppercase tracking-wider rounded-xl cursor-pointer flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                  >
                    <Printer size={13} /> Order Print Now
                  </button>
                </div>

              </div>

              </>
              )}
            </div>

            {/* Footer close option */}
            <div className="p-4 bg-white border-t border-[#e5e1da] flex justify-end">
              <button
                type="button"
                onClick={() => setIsExamplePrintsOpen(false)}
                className="px-5 py-2 border border-[#e5e1da] hover:border-[#2c2a29] font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-colors text-gray-600 hover:text-black"
              >
                Close Gallery Showcase
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
