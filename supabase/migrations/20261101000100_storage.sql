-- Storage buckets and policies.
--   client-documents (private): {owner_id}/{uuid}-{filename}; PDF/DOCX/JPEG/PNG up to 10 MB
--   avatars          (private): {user_id}/{filename}; images up to 2 MB
--   attorney-photos  (public):  {attorney_id}/{filename}; managed by partners/admins

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('client-documents', 'client-documents', false, 10485760, array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg', 'image/png']),
  ('avatars', 'avatars', false, 2097152, array['image/jpeg', 'image/png', 'image/webp']),
  ('attorney-photos', 'attorney-photos', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- client-documents
create policy "client docs: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'client-documents'
         and ((storage.foldername(name))[1] = (select auth.uid())::text
              or public.is_manager()
              or public.attorney_has_client(((storage.foldername(name))[1])::uuid)));
create policy "client docs: owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'client-documents'
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "client docs: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'client-documents'
         and (storage.foldername(name))[1] = (select auth.uid())::text);

-- avatars
create policy "avatars: owner read" on storage.objects for select to authenticated
  using (bucket_id = 'avatars'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or public.is_staff()));
create policy "avatars: owner write" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: owner update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- attorney-photos: public bucket (reads need no policy), managers write
create policy "attorney photos: manager write" on storage.objects for insert to authenticated
  with check (bucket_id = 'attorney-photos' and public.is_manager());
create policy "attorney photos: manager update" on storage.objects for update to authenticated
  using (bucket_id = 'attorney-photos' and public.is_manager());
create policy "attorney photos: manager delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attorney-photos' and public.is_manager());
