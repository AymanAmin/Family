revoke all on function public.get_moderation_request_details(text, uuid) from public;
grant execute on function public.get_moderation_request_details(text, uuid) to authenticated;

revoke all on function public.review_secondary_moderation_request(text, uuid, text) from public;
grant execute on function public.review_secondary_moderation_request(text, uuid, text) to authenticated;
